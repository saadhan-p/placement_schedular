from typing import List, Dict, Tuple, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from backend.app.models.models import Company, Student, Room, Interview, ScheduleVersion, CompanyAvailability
from backend.app.scheduler.constraints import ConstraintChecker

def format_time(minutes: int) -> str:
    """Convert minutes from day start to HH:MM format."""
    hours = minutes // 60
    mins = minutes % 60
    return f"{hours:02d}:{mins:02d}"

class SchedulingEngine:
    def __init__(self, db: Session, version_id: int = 1):
        self.db = db
        self.version_id = version_id
        
        # Load resources from database
        self.companies = self.db.query(Company).all()
        self.students = self.db.query(Student).filter(Student.withdrawal_status == False).all()
        self.rooms = self.db.query(Room).filter(Room.is_available == True).all()
        
        # Initialize constraint checker
        self.checker = ConstraintChecker(self.rooms, self.companies, self.students)

    def generate_schedule(self) -> Tuple[List[Interview], List[Interview]]:
        """
        Generate schedule deterministically.
        Returns:
            Tuple of (scheduled_interviews, unscheduled_interviews)
        """
        # 1. Create list of student shortlists
        pairing_candidates = []
        student_shortlist_counts = {}
        
        for student in self.students:
            if not student.shortlisted_companies:
                continue
            cids = [cid.strip() for cid in student.shortlisted_companies.split(",") if cid.strip()]
            student_shortlist_counts[student.id] = len(cids)
            
            for cid in cids:
                pairing_candidates.append((student, cid))

        # 2. Sort candidate pairings:
        #    - Company priority tier (Tier 1 first, then 2, then 3)
        #    - Student constraint level (students with more shortlists first, to squeeze them in)
        #    - Student CGPA (descending)
        company_map = {c.id: c for c in self.companies}
        
        def sorting_key(item):
            student, cid = item
            company = company_map.get(cid)
            tier = company.priority_tier if company else 3
            shortlist_cnt = student_shortlist_counts.get(student.id, 0)
            cgpa = student.cgpa
            
            # Note: tier is 1, 2, 3 (so tier 1 is lowest number but highest priority)
            return (tier, -shortlist_cnt, -cgpa)

        pairing_candidates.sort(key=sorting_key)

        scheduled_interviews = []
        unscheduled_interviews = []

        # 3. For each candidate, find a feasible slot
        for student, cid in pairing_candidates:
            company = company_map.get(cid)
            if not company:
                continue
                
            # Quick eligibility check
            if student.cgpa < company.cgpa_cutoff:
                interview_id = f"V{self.version_id}_{student.id}_{cid}"
                uns_iv = Interview(
                    id=interview_id,
                    version_id=self.version_id,
                    student_id=student.id,
                    company_id=cid,
                    status="UNSCHEDULED",
                    failure_reason=f"Student CGPA {student.cgpa} is below company cutoff of {company.cgpa_cutoff}",
                    blocking_constraint="INELIGIBILITY"
                )
                unscheduled_interviews.append(uns_iv)
                continue

            # Find best slot
            best_slot = self._find_best_slot_for_pairing(student, company)
            
            interview_id = f"V{self.version_id}_{student.id}_{cid}"
            
            if best_slot:
                day, start_time, end_time, panel_idx, room_id = best_slot
                
                # Add to checker state to block resources
                self.checker.add_interview(
                    interview_id=interview_id,
                    student_id=student.id,
                    company_id=cid,
                    panel_index=panel_idx,
                    room_id=room_id,
                    day=day,
                    start_time=start_time,
                    end_time=end_time
                )
                
                iv = Interview(
                    id=interview_id,
                    version_id=self.version_id,
                    student_id=student.id,
                    company_id=cid,
                    panel_index=panel_idx,
                    room_id=room_id,
                    day=day,
                    start_time=start_time,
                    end_time=end_time,
                    status="SCHEDULED"
                )
                scheduled_interviews.append(iv)
            else:
                # Compile explainability metrics for why scheduling failed
                reason, primary_blocker = self._diagnose_scheduling_failure(student, company)
                uns_iv = Interview(
                    id=interview_id,
                    version_id=self.version_id,
                    student_id=student.id,
                    company_id=cid,
                    status="UNSCHEDULED",
                    failure_reason=reason,
                    blocking_constraint=primary_blocker
                )
                unscheduled_interviews.append(uns_iv)

        return scheduled_interviews, unscheduled_interviews

    def _search_slots_on_days(self, student: Student, company: Company, days: List[int]) -> Optional[Tuple[int, int, int, int, str]]:
        """Search for a feasible slot on the specified list of days."""
        duration = company.interview_duration
        best_score = float('inf')
        best_assignment = None

        for day in days:
            for start_time in range(540, 1020 - duration + 1, 15):
                end_time = start_time + duration
                
                # Check student conflict first (student is the most scarce resource usually)
                has_student_conflict, _ = self.checker.check_student_conflict(student.id, day, start_time, end_time)
                if has_student_conflict:
                    continue
                    
                # Search for an available room and panel
                for room in self.rooms:
                    has_room_conflict, _ = self.checker.check_room_conflict(room.id, day, start_time, end_time)
                    if has_room_conflict:
                        continue
                        
                    for panel_idx in range(1, company.panel_count + 1):
                        has_panel_conflict, _ = self.checker.check_panel_conflict(company.id, panel_idx, day, start_time, end_time)
                        if has_panel_conflict:
                            continue
                            
                        # If we reach here, this is a FEASIBLE slot! Let's score it.
                        score = self._calculate_soft_penalty(student, company, day, start_time, end_time, room.id)
                        
                        if score < best_score:
                            best_score = score
                            best_assignment = (day, start_time, end_time, panel_idx, room.id)
                            
        return best_assignment

    def _find_best_slot_for_pairing(self, student: Student, company: Company) -> Optional[Tuple[int, int, int, int, str]]:
        """
        Evaluate all possible slots and return the best one based on soft constraints.
        Slot representation: (day, start, end, panel, room)
        """
        # Parse company available days
        pref_days = [int(d.strip()) for d in company.preferred_days.split(",") if d.strip().isdigit()] if company.preferred_days else [1, 2, 3, 4]

        # 1. Try preferred days first
        slot = self._search_slots_on_days(student, company, pref_days)
        if slot:
            return slot

        # 2. Fallback: Try all other days in placement week (1 to 4) if preferred days are full
        all_days = [1, 2, 3, 4]
        other_days = [d for d in all_days if d not in pref_days]
        if other_days:
            slot = self._search_slots_on_days(student, company, other_days)
            if slot:
                return slot

        return None

    def _calculate_soft_penalty(self, student: Student, company: Company, day: int, start: int, end: int, room_id: str) -> float:
        """
        Scores a candidate slot. Lower is better.
        Soft constraints:
        1. Preferred company day: Keep companies on preferred days (already enforced in search, but could extend)
        2. Student waiting time: Minimize gaps between consecutive interviews for a student on the same day.
        3. Student room changes: Minimize student traveling between rooms.
        """
        penalty = 0.0
        
        # Get student's existing scheduled interviews for this day
        day_interviews = []
        for d, s, e, _ in self.checker.student_schedules.get(student.id, []):
            if d == day:
                day_interviews.append((s, e))
                
        if day_interviews:
            # Sort interviews by start time
            day_interviews.sort()
            
            # Find min gap to any existing interview on this day
            min_gap = float('inf')
            for s, e in day_interviews:
                if start >= e:
                    min_gap = min(min_gap, start - e)
                elif end <= s:
                    min_gap = min(min_gap, s - end)
            
            if min_gap != float('inf'):
                # We prefer back-to-back (gap = 0) or small gaps
                # If gap is 0, penalty is 0. If gap is > 0, penalty increases.
                if min_gap > 0:
                    penalty += min_gap * 0.1  # small linear waiting penalty (1 point per 10 mins)
                    
            # Check room change travel penalty
            # Find if there is an interview right before or after this slot
            for d_idx, s, e, iv_id in self.checker.student_schedules.get(student.id, []):
                if d_idx == day and (start == e or end == s):
                    # Find room for that interview
                    prev_room = None
                    for r_id, r_sched in self.checker.room_schedules.items():
                        if any(item[3] == iv_id for item in r_sched):
                            prev_room = r_id
                            break
                    if prev_room and prev_room != room_id:
                        penalty += 15.0  # travel penalty if student has to switch rooms back-to-back

        # Prefer scheduling interviews earlier in the day if all else is equal
        penalty += (start - 540) * 0.01

        return penalty

    def _diagnose_scheduling_failure(self, student: Student, company: Company) -> Tuple[str, str]:
        """Diagnose why an interview could not be scheduled across all slots."""
        student_clashes = 0
        room_clashes = 0
        panel_clashes = 0
        total_slots_checked = 0
        
        duration = company.interview_duration
        pref_days = [int(d.strip()) for d in company.preferred_days.split(",") if d.strip().isdigit()] if company.preferred_days else [1, 2, 3, 4]
        
        for day in pref_days:
            for start_time in range(540, 1020 - duration + 1, 15):
                end_time = start_time + duration
                total_slots_checked += 1
                
                # Check student conflict
                stud_conf, _ = self.checker.check_student_conflict(student.id, day, start_time, end_time)
                if stud_conf:
                    student_clashes += 1
                    continue
                    
                # Check panel capacity
                panel_conf = True
                for panel_idx in range(1, company.panel_count + 1):
                    p_conf, _ = self.checker.check_panel_conflict(company.id, panel_idx, day, start_time, end_time)
                    if not p_conf:
                        panel_conf = False
                        break
                if panel_conf:
                    panel_clashes += 1
                    continue
                    
                # Check room capacity
                room_conf = True
                for room in self.rooms:
                    r_conf, _ = self.checker.check_room_conflict(room.id, day, start_time, end_time)
                    if not r_conf:
                        room_conf = False
                        break
                if room_conf:
                    room_clashes += 1
                    continue

        if total_slots_checked == 0:
            return "Company has no available interview days or slots configured.", "COMPANY_AVAILABILITY_EXHAUSTED"

        # Determine the primary bottleneck
        if student_clashes >= total_slots_checked * 0.9:
            return f"Student {student.name} is already busy in almost all slots during company available times ({student_clashes}/{total_slots_checked} slots busy).", "STUDENT_CONFLICT"
        elif panel_clashes >= room_clashes:
            return f"Company {company.name} has all {company.panel_count} interview panels fully booked during available slots.", "PANEL_CONFLICT"
        else:
            return "All available interview rooms are fully occupied during the required time slots.", "ROOM_CONFLICT"

def run_initial_scheduler(db: Session, version_id: int = 1) -> Dict[str, int]:
    """Execute scheduling and save results in database."""
    engine = SchedulingEngine(db, version_id)
    scheduled, unscheduled = engine.generate_schedule()
    
    # Save to DB
    # Clean previous interviews for this version if any
    db.query(Interview).filter(Interview.version_id == version_id).delete()
    
    db.add_all(scheduled)
    db.add_all(unscheduled)
    db.commit()
    
    return {
        "scheduled": len(scheduled),
        "unscheduled": len(unscheduled),
        "total": len(scheduled) + len(unscheduled)
    }

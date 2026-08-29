import json
from datetime import datetime
from typing import List, Dict, Tuple, Optional, Any
from sqlalchemy.orm import Session
from backend.app.models.models import Company, Student, Room, Interview, ScheduleVersion, DisruptionEvent, ScheduleChange, Notification
from backend.app.scheduler.constraints import ConstraintChecker
from backend.app.scheduler.engine import format_time

class ReplanningEngine:
    def __init__(self, db: Session, old_version_id: int):
        self.db = db
        self.old_version_id = old_version_id
        
        # Load resources from database
        self.companies = self.db.query(Company).all()
        self.students = self.db.query(Student).all()
        self.rooms = self.db.query(Room).all()
        
        # Load all old interviews
        self.old_interviews = self.db.query(Interview).filter(Interview.version_id == old_version_id).all()
        self.old_interviews_dict = {iv.id: iv for iv in self.old_interviews}
        
    def execute_company_delay(self, company_id: str, day: int, delay_minutes: int) -> Tuple[ScheduleVersion, DisruptionEvent]:
        """Disruption A: Company arrives late. e.g. delay by 120 mins."""
        # Calculate new earliest start time on that day
        # Normal start time is 09:00 AM (540 mins)
        new_start_time = 540 + delay_minutes
        
        # Create new version
        new_version = self._create_new_version(f"After {company_id} Delay on Day {day}")
        
        # Identify directly affected interviews:
        # Scheduled interviews of this company on this day that start before the new start time.
        affected_ids = []
        unaffected_interviews = []
        
        for iv in self.old_interviews:
            # We copy all interviews to the new version first
            new_iv = self._copy_interview(iv, new_version.id)
            
            if iv.status == "SCHEDULED" and iv.company_id == company_id and iv.day == day and iv.start_time < new_start_time:
                new_iv.status = "UNSCHEDULED"
                new_iv.failure_reason = f"Company delayed by {delay_minutes} minutes on Day {day}."
                new_iv.blocking_constraint = "COMPANY_DELAY"
                new_iv.start_time = None
                new_iv.end_time = None
                new_iv.room_id = None
                new_iv.panel_index = None
                affected_ids.append(new_iv.id)
            else:
                unaffected_interviews.append(new_iv)
                
        self.db.commit()
        
        # Now reschedule the affected interviews
        self._reschedule_vacated_interviews(
            new_version_id=new_version.id,
            vacated_interview_ids=affected_ids,
            unaffected_interviews=unaffected_interviews,
            disruption_constraint={
                "type": "COMPANY_DELAY",
                "company_id": company_id,
                "day": day,
                "earliest_start": new_start_time
            }
        )
        
        # Record disruption event
        event = DisruptionEvent(
            disruption_type="COMPANY_DELAY",
            parameters=json.dumps({"company_id": company_id, "day": day, "delay_minutes": delay_minutes}),
            old_version_id=self.old_version_id,
            new_version_id=new_version.id,
            timestamp=datetime.utcnow()
        )
        self.db.add(event)
        self.db.commit()
        
        return new_version, event

    def execute_panel_dropout(self, company_id: str, panel_index: int, day: int, start_time: int, end_time: int) -> Tuple[ScheduleVersion, DisruptionEvent]:
        """Disruption B: A specific panel of a company becomes unavailable for a duration on a day."""
        new_version = self._create_new_version(f"After Panel {panel_index} Dropout for {company_id}")
        
        affected_ids = []
        unaffected_interviews = []
        
        for iv in self.old_interviews:
            new_iv = self._copy_interview(iv, new_version.id)
            
            # Check if this interview is scheduled with the dropout panel during the dropout range
            if (iv.status == "SCHEDULED" and iv.company_id == company_id and 
                iv.panel_index == panel_index and iv.day == day and 
                max(iv.start_time, start_time) < min(iv.end_time, end_time)):
                
                new_iv.status = "UNSCHEDULED"
                new_iv.failure_reason = f"Panel {panel_index} dropped out on Day {day} from {format_time(start_time)} to {format_time(end_time)}."
                new_iv.blocking_constraint = "PANEL_DROPOUT"
                new_iv.start_time = None
                new_iv.end_time = None
                new_iv.room_id = None
                new_iv.panel_index = None
                affected_ids.append(new_iv.id)
            else:
                unaffected_interviews.append(new_iv)
                
        self.db.commit()
        
        self._reschedule_vacated_interviews(
            new_version_id=new_version.id,
            vacated_interview_ids=affected_ids,
            unaffected_interviews=unaffected_interviews,
            disruption_constraint={
                "type": "PANEL_DROPOUT",
                "company_id": company_id,
                "panel_index": panel_index,
                "day": day,
                "start": start_time,
                "end": end_time
            }
        )
        
        event = DisruptionEvent(
            disruption_type="PANEL_DROPOUT",
            parameters=json.dumps({
                "company_id": company_id,
                "panel_index": panel_index,
                "day": day,
                "start_time": start_time,
                "end_time": end_time
            }),
            old_version_id=self.old_version_id,
            new_version_id=new_version.id,
            timestamp=datetime.utcnow()
        )
        self.db.add(event)
        self.db.commit()
        
        return new_version, event

    def execute_student_withdrawal(self, student_id: str) -> Tuple[ScheduleVersion, DisruptionEvent]:
        """Disruption C: Student withdraws from placement week. Just remove interviews and release resources."""
        new_version = self._create_new_version(f"After Student {student_id} Withdrawal")
        
        # Student status is updated in database
        student = self.db.query(Student).filter(Student.id == student_id).first()
        if student:
            student.withdrawal_status = True
            student.placement_status = "WITHDRAWN"
            
        # We simply remove all scheduled interviews of this student. No other rescheduling needed! Churn is 0.
        for iv in self.old_interviews:
            new_iv = self._copy_interview(iv, new_version.id)
            
            if iv.student_id == student_id:
                new_iv.status = "UNSCHEDULED"
                new_iv.failure_reason = "Student withdrew from placements."
                new_iv.blocking_constraint = "STUDENT_WITHDRAWAL"
                new_iv.start_time = None
                new_iv.end_time = None
                new_iv.room_id = None
                new_iv.panel_index = None

        self.db.commit()
        
        # Record event
        event = DisruptionEvent(
            disruption_type="STUDENT_WITHDRAWAL",
            parameters=json.dumps({"student_id": student_id}),
            old_version_id=self.old_version_id,
            new_version_id=new_version.id,
            timestamp=datetime.utcnow()
        )
        self.db.add(event)
        self.db.commit()
        
        return new_version, event

    def execute_room_unavailable(self, room_id: str, day: int, start_time: int, end_time: int) -> Tuple[ScheduleVersion, DisruptionEvent]:
        """Disruption D: Room becomes unavailable. Move interviews in that room during that slot."""
        new_version = self._create_new_version(f"After Room {room_id} Outage on Day {day}")
        
        affected_ids = []
        unaffected_interviews = []
        
        for iv in self.old_interviews:
            new_iv = self._copy_interview(iv, new_version.id)
            
            # Check if scheduled in this room during outage
            if (iv.status == "SCHEDULED" and iv.room_id == room_id and 
                iv.day == day and max(iv.start_time, start_time) < min(iv.end_time, end_time)):
                
                new_iv.status = "UNSCHEDULED"
                new_iv.failure_reason = f"Room {room_id} unavailable on Day {day} from {format_time(start_time)} to {format_time(end_time)}."
                new_iv.blocking_constraint = "ROOM_UNAVAILABLE"
                new_iv.start_time = None
                new_iv.end_time = None
                new_iv.room_id = None
                new_iv.panel_index = None
                affected_ids.append(new_iv.id)
            else:
                unaffected_interviews.append(new_iv)
                
        self.db.commit()
        
        self._reschedule_vacated_interviews(
            new_version_id=new_version.id,
            vacated_interview_ids=affected_ids,
            unaffected_interviews=unaffected_interviews,
            disruption_constraint={
                "type": "ROOM_UNAVAILABLE",
                "room_id": room_id,
                "day": day,
                "start": start_time,
                "end": end_time
            }
        )
        
        event = DisruptionEvent(
            disruption_type="ROOM_UNAVAILABLE",
            parameters=json.dumps({
                "room_id": room_id,
                "day": day,
                "start_time": start_time,
                "end_time": end_time
            }),
            old_version_id=self.old_version_id,
            new_version_id=new_version.id,
            timestamp=datetime.utcnow()
        )
        self.db.add(event)
        self.db.commit()
        
        return new_version, event

    def _create_new_version(self, name: str) -> ScheduleVersion:
        """Create a new schedule version in the database."""
        # Deactivate all current versions
        self.db.query(ScheduleVersion).update({ScheduleVersion.is_active: False})
        
        new_v = ScheduleVersion(
            name=name,
            created_at=datetime.utcnow(),
            is_active=True
        )
        self.db.add(new_v)
        self.db.commit()
        self.db.refresh(new_v)
        return new_v

    def _copy_interview(self, old_iv: Interview, new_version_id: int) -> Interview:
        """Copy interview metadata to the new version version."""
        # Clean ID structure: V{version}_{student}_{company}
        new_id = f"V{new_version_id}_{old_iv.student_id}_{old_iv.company_id}"
        new_iv = Interview(
            id=new_id,
            version_id=new_version_id,
            student_id=old_iv.student_id,
            company_id=old_iv.company_id,
            panel_index=old_iv.panel_index,
            room_id=old_iv.room_id,
            day=old_iv.day,
            start_time=old_iv.start_time,
            end_time=old_iv.end_time,
            status=old_iv.status,
            failure_reason=old_iv.failure_reason,
            blocking_constraint=old_iv.blocking_constraint
        )
        self.db.add(new_iv)
        return new_iv

    def _reschedule_vacated_interviews(self, new_version_id: int, vacated_interview_ids: List[str], unaffected_interviews: List[Interview], disruption_constraint: Dict[str, Any]):
        """
        Reschedule the vacated interviews.
        Uses ConstraintChecker to ensure no conflicts are introduced.
        """
        # Initialize constraint checker with rooms, companies, students
        # Note: We filter student list to non-withdrawn
        active_students = [s for s in self.students if not s.withdrawal_status]
        active_rooms = [r for r in self.rooms if r.is_available]
        
        checker = ConstraintChecker(active_rooms, self.companies, active_students)
        
        # 1. Load unaffected scheduled interviews to lock them in place
        checker.load_existing_interviews(unaffected_interviews)
        
        # 2. Apply disruption constraints to the checker
        self._apply_disruption_to_checker(checker, disruption_constraint)
        
        # 3. Load vacated interviews to reschedule
        vacated_interviews = self.db.query(Interview).filter(Interview.id.in_(vacated_interview_ids)).all()
        
        # Sort vacated interviews: Tier of company, then student shortlist size
        company_map = {c.id: c for c in self.companies}
        student_shortlists = {s.id: len(s.shortlisted_companies.split(",")) if s.shortlisted_companies else 0 for s in self.students}
        
        def sorting_key(iv):
            company = company_map.get(iv.company_id)
            tier = company.priority_tier if company else 3
            shortlist_cnt = student_shortlists.get(iv.student_id, 0)
            return (tier, -shortlist_cnt)
            
        vacated_interviews.sort(key=sorting_key)
        
        # 4. Attempt to find slot for each vacated interview
        for iv in vacated_interviews:
            company = company_map.get(iv.company_id)
            student = next(s for s in self.students if s.id == iv.student_id)
            duration = company.interview_duration
            
            # Step A: First try to schedule in a FREE slot (zero churn!)
            best_slot = self._find_free_slot(checker, student, company, duration, disruption_constraint)
            
            if best_slot:
                day, start, end, panel, room = best_slot
                # Apply
                iv.status = "SCHEDULED"
                iv.day = day
                iv.start_time = start
                iv.end_time = end
                iv.panel_index = panel
                iv.room_id = room
                iv.failure_reason = None
                iv.blocking_constraint = None
                
                checker.add_interview(iv.id, student.id, company.id, panel, room, day, start, end)
            else:
                # Step B: If no free slot, see if we can swap/displace a lower-priority company's interview
                # Find lower priority interviews that overlap with potential slots
                displaced = self._attempt_displacement_reschedule(checker, student, company, duration, disruption_constraint, new_version_id)
                if displaced:
                    day, start, end, panel, room = displaced
                    iv.status = "SCHEDULED"
                    iv.day = day
                    iv.start_time = start
                    iv.end_time = end
                    iv.panel_index = panel
                    iv.room_id = room
                    iv.failure_reason = None
                    iv.blocking_constraint = None
                    
                    checker.add_interview(iv.id, student.id, company.id, panel, room, day, start, end)
                else:
                    # Genuinely infeasible. Leave as UNSCHEDULED.
                    # Generate diagnosis
                    reason, primary_blocker = self._diagnose_replan_failure(checker, student, company, duration, disruption_constraint)
                    iv.status = "UNSCHEDULED"
                    iv.failure_reason = reason
                    iv.blocking_constraint = primary_blocker
                    
        self.db.commit()

    def _apply_disruption_to_checker(self, checker: ConstraintChecker, constraint: Dict[str, Any]):
        """Inject the disruption directly into the checker to block those resource windows."""
        dtype = constraint["type"]
        if dtype == "COMPANY_DELAY":
            # Company delay blocks all slots before earliest_start on day
            # Let's represent this by adding a fake interview blocking the panels of this company before earliest_start
            company_id = constraint["company_id"]
            day = constraint["day"]
            earliest_start = constraint["earliest_start"]
            
            company = checker.companies_dict.get(company_id)
            if company:
                for p in range(1, company.panel_count + 1):
                    # Add dummy interview from 09:00 (540) to earliest_start
                    checker.add_interview(
                        interview_id=f"DELAY_BLOCK_{company_id}_P{p}",
                        student_id="DUMMY_STUDENT",
                        company_id=company_id,
                        panel_index=p,
                        room_id="R001",  # dummy room
                        day=day,
                        start_time=540,
                        end_time=earliest_start
                    )
        elif dtype == "PANEL_DROPOUT":
            # Panel dropout blocks specific panel index during the time range
            company_id = constraint["company_id"]
            panel_idx = constraint["panel_index"]
            day = constraint["day"]
            start = constraint["start"]
            end = constraint["end"]
            
            checker.add_interview(
                interview_id=f"DROPOUT_BLOCK_{company_id}_P{panel_idx}",
                student_id="DUMMY_STUDENT",
                company_id=company_id,
                panel_index=panel_idx,
                room_id="R001",
                day=day,
                start_time=start,
                end_time=end
            )
        elif dtype == "ROOM_UNAVAILABLE":
            # Room unavailable blocks the room during the time range
            room_id = constraint["room_id"]
            day = constraint["day"]
            start = constraint["start"]
            end = constraint["end"]
            
            checker.add_interview(
                interview_id=f"ROOM_BLOCK_{room_id}",
                student_id="DUMMY_STUDENT",
                company_id="DUMMY_COMPANY",
                panel_index=1,
                room_id=room_id,
                day=day,
                start_time=start,
                end_time=end
            )

    def _search_free_slot_on_days(self, checker: ConstraintChecker, student: Student, company: Company, duration: int, days: List[int]) -> Optional[Tuple[int, int, int, int, str]]:
        """Scan specified days for a completely free feasible slot."""
        for day in days:
            for start in range(540, 1020 - duration + 1, 15):
                end = start + duration
                
                # Check student conflict
                s_conf, _ = checker.check_student_conflict(student.id, day, start, end)
                if s_conf:
                    continue
                    
                # Search available rooms
                for room in checker.rooms_dict.values():
                    if not room.is_available:
                        continue
                    r_conf, _ = checker.check_room_conflict(room.id, day, start, end)
                    if r_conf:
                        continue
                        
                    # Search available company panels
                    for p in range(1, company.panel_count + 1):
                        p_conf, _ = checker.check_panel_conflict(company.id, p, day, start, end)
                        if p_conf:
                            continue
                            
                        # Found a free slot!
                        return (day, start, end, p, room.id)
        return None

    def _find_free_slot(self, checker: ConstraintChecker, student: Student, company: Company, duration: int, constraint: Dict[str, Any]) -> Optional[Tuple[int, int, int, int, str]]:
        """Find a completely free feasible slot for the student and company."""
        pref_days = [int(d.strip()) for d in company.preferred_days.split(",") if d.strip().isdigit()] if company.preferred_days else [1, 2, 3, 4]
        
        # 1. Try preferred days first
        slot = self._search_free_slot_on_days(checker, student, company, duration, pref_days)
        if slot:
            return slot
            
        # 2. Fallback: try all other days in placement week (1 to 4)
        all_days = [1, 2, 3, 4]
        other_days = [d for d in all_days if d not in pref_days]
        if other_days:
            slot = self._search_free_slot_on_days(checker, student, company, duration, other_days)
            if slot:
                return slot
                
        return None

    def _search_displacement_on_days(self, checker: ConstraintChecker, student: Student, company: Company, duration: int, days: List[int], constraint: Dict[str, Any], version_id: int) -> Optional[Tuple[int, int, int, int, str]]:
        """Scan specified days to find if we can displace a lower priority interview."""
        for day in days:
            for start in range(540, 1020 - duration + 1, 15):
                end = start + duration
                
                # Check student conflict (cannot violate student hard constraints)
                s_conf, _ = checker.check_student_conflict(student.id, day, start, end)
                if s_conf:
                    continue
                    
                # Room check
                for room in checker.rooms_dict.values():
                    if not room.is_available:
                        continue
                    r_conf, _ = checker.check_room_conflict(room.id, day, start, end)
                    if r_conf:
                        continue
                        
                    # Panel check: Let's see if we overlap with a scheduled interview
                    for p in range(1, company.panel_count + 1):
                        # Get overlapping interviews for this panel
                        panel_sched = checker.panel_schedules.get((company.id, p), [])
                        overlapping = [item for item in panel_sched if item[0] == day and max(item[1], start) < min(item[2], end)]
                        
                        if len(overlapping) == 1:
                            overlap_iv_id = overlapping[0][3]
                            if overlap_iv_id.startswith("DELAY_BLOCK_") or overlap_iv_id.startswith("DROPOUT_BLOCK_"):
                                continue  # cannot displace disruption dummy blocks!
                                
                            # Fetch the overlapping interview object from the DB for this version
                            target_iv = self.db.query(Interview).filter(Interview.id == overlap_iv_id, Interview.version_id == version_id).first()
                            if not target_iv:
                                continue
                                
                            # Check priority: We can only displace if target has LOWER priority than us
                            target_comp = checker.companies_dict.get(target_iv.company_id)
                            if target_comp and target_comp.priority_tier > company.priority_tier:
                                # Target is tier 3, we are tier 1 or 2 -> we can attempt to displace it!
                                # Temporarily remove target from checker
                                target_duration = target_comp.interview_duration
                                checker.remove_interview(target_iv.id, target_iv.student_id, target_iv.company_id, target_iv.panel_index, target_iv.room_id, target_iv.day, target_iv.start_time, target_iv.end_time)
                                
                                # Try to find another free slot for the target interview
                                target_student = next(s for s in self.students if s.id == target_iv.student_id)
                                alt_slot = self._find_free_slot(checker, target_student, target_comp, target_duration, constraint)
                                
                                if alt_slot:
                                    # Success! Move target to alt slot permanently
                                    alt_day, alt_start, alt_end, alt_panel, alt_room = alt_slot
                                    target_iv.day = alt_day
                                    target_iv.start_time = alt_start
                                    target_iv.end_time = alt_end
                                    target_iv.panel_index = alt_panel
                                    target_iv.room_id = alt_room
                                    
                                    # Add back target in its new slot
                                    checker.add_interview(target_iv.id, target_iv.student_id, target_iv.company_id, alt_panel, alt_room, alt_day, alt_start, alt_end)
                                    self.db.commit()
                                    
                                    # Return the slot we just freed up
                                    return (day, start, end, p, room.id)
                                else:
                                    # Revert: put target back
                                    checker.add_interview(target_iv.id, target_iv.student_id, target_iv.company_id, target_iv.panel_index, target_iv.room_id, target_iv.day, target_iv.start_time, target_iv.end_time)
        return None

    def _attempt_displacement_reschedule(self, checker: ConstraintChecker, student: Student, company: Company, duration: int, constraint: Dict[str, Any], version_id: int) -> Optional[Tuple[int, int, int, int, str]]:
        """
        If no free slot, see if we can move a lower-priority company's interview.
        """
        pref_days = [int(d.strip()) for d in company.preferred_days.split(",") if d.strip().isdigit()] if company.preferred_days else [1, 2, 3, 4]
        
        # 1. Try preferred days first
        slot = self._search_displacement_on_days(checker, student, company, duration, pref_days, constraint, version_id)
        if slot:
            return slot
            
        # 2. Fallback: try all other days in placement week (1 to 4)
        all_days = [1, 2, 3, 4]
        other_days = [d for d in all_days if d not in pref_days]
        if other_days:
            slot = self._search_displacement_on_days(checker, student, company, duration, other_days, constraint, version_id)
            if slot:
                return slot
                
        return None

    def _diagnose_replan_failure(self, checker: ConstraintChecker, student: Student, company: Company, duration: int, constraint: Dict[str, Any]) -> Tuple[str, str]:
        """Diagnose why rescheduling failed during replanning."""
        student_clashes = 0
        room_clashes = 0
        panel_clashes = 0
        total_slots = 0
        
        pref_days = [int(d.strip()) for d in company.preferred_days.split(",") if d.strip().isdigit()] if company.preferred_days else [1, 2, 3, 4]
        
        for day in pref_days:
            for start in range(540, 1020 - duration + 1, 15):
                end = start + duration
                total_slots += 1
                
                s_conf, _ = checker.check_student_conflict(student.id, day, start, end)
                if s_conf:
                    student_clashes += 1
                    continue
                    
                panel_conf = True
                for p in range(1, company.panel_count + 1):
                    p_conf, _ = checker.check_panel_conflict(company.id, p, day, start, end)
                    if not p_conf:
                        panel_conf = False
                        break
                if panel_conf:
                    panel_clashes += 1
                    continue
                    
                room_conf = True
                for room in checker.rooms_dict.values():
                    r_conf, _ = checker.check_room_conflict(room.id, day, start, end)
                    if not r_conf:
                        room_conf = False
                        break
                if room_conf:
                    room_clashes += 1
                    continue
                    
        if student_clashes >= total_slots * 0.9:
            return f"Rescheduling failed: Student {student.name} is fully booked across remaining eligible slots.", "STUDENT_CONFLICT"
        elif panel_clashes >= room_clashes:
            return f"Rescheduling failed: Company {company.name} has no available panels due to disruptions or other bookings.", "PANEL_CONFLICT"
        else:
            return "Rescheduling failed: No available interview rooms are left due to outages or bookings.", "ROOM_CONFLICT"

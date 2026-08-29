from typing import List, Dict, Tuple, Optional
from backend.app.models.models import Company, Student, Room, Interview

def intervals_overlap(s1: int, e1: int, s2: int, e2: int) -> bool:
    """Check if two time intervals overlap (open intervals)."""
    return max(s1, s2) < min(e1, e2)

class ConstraintChecker:
    def __init__(self, rooms: List[Room], companies: List[Company], students: List[Student]):
        self.rooms_dict = {r.id: r for r in rooms}
        self.companies_dict = {c.id: c for c in companies}
        self.students_dict = {s.id: s for s in students}
        
        # State tracking: mapping resource -> list of scheduled (day, start, end, interview_id)
        self.student_schedules: Dict[str, List[Tuple[int, int, int, str]]] = {s.id: [] for s in students}
        self.room_schedules: Dict[str, List[Tuple[int, int, int, str]]] = {r.id: [] for r in rooms}
        # Panel schedules: (company_id, panel_index) -> list of (day, start, end, interview_id)
        self.panel_schedules: Dict[Tuple[str, int], List[Tuple[int, int, int, str]]] = {}
        for c in companies:
            for p in range(1, c.panel_count + 1):
                self.panel_schedules[(c.id, p)] = []

    def load_existing_interviews(self, interviews: List[Interview]):
        """Load currently scheduled interviews into the checker state."""
        for iv in interviews:
            if iv.status == "SCHEDULED" and iv.start_time is not None:
                self.add_interview(
                    interview_id=iv.id,
                    student_id=iv.student_id,
                    company_id=iv.company_id,
                    panel_index=iv.panel_index,
                    room_id=iv.room_id,
                    day=iv.day,
                    start_time=iv.start_time,
                    end_time=iv.end_time
                )

    def add_interview(self, interview_id: str, student_id: str, company_id: str, panel_index: int, room_id: str, day: int, start_time: int, end_time: int):
        if student_id not in self.student_schedules:
            self.student_schedules[student_id] = []
        self.student_schedules[student_id].append((day, start_time, end_time, interview_id))
        
        if room_id not in self.room_schedules:
            self.room_schedules[room_id] = []
        self.room_schedules[room_id].append((day, start_time, end_time, interview_id))
        
        if (company_id, panel_index) not in self.panel_schedules:
            self.panel_schedules[(company_id, panel_index)] = []
        self.panel_schedules[(company_id, panel_index)].append((day, start_time, end_time, interview_id))

    def remove_interview(self, interview_id: str, student_id: str, company_id: str, panel_index: int, room_id: str, day: int, start_time: int, end_time: int):
        if student_id in self.student_schedules:
            self.student_schedules[student_id] = [item for item in self.student_schedules[student_id] if item[3] != interview_id]
        if room_id in self.room_schedules:
            self.room_schedules[room_id] = [item for item in self.room_schedules[room_id] if item[3] != interview_id]
        if (company_id, panel_index) in self.panel_schedules:
            self.panel_schedules[(company_id, panel_index)] = [item for item in self.panel_schedules[(company_id, panel_index)] if item[3] != interview_id]

    def check_student_conflict(self, student_id: str, day: int, start: int, end: int, exclude_interview_id: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """Check if student has an overlapping interview."""
        if student_id.startswith("DUMMY_"):
            return False, None
        student = self.students_dict.get(student_id)
        if not student:
            return True, "STUDENT_NOT_FOUND"
        if student.withdrawal_status or student.placement_status == "WITHDRAWN":
            return True, "STUDENT_WITHDRAWN"
            
        for d, s, e, iv_id in self.student_schedules.get(student_id, []):
            if exclude_interview_id and iv_id == exclude_interview_id:
                continue
            if d == day and intervals_overlap(s, e, start, end):
                return True, f"STUDENT_CONFLICT: overlaps with interview {iv_id} ({s}-{e} mins)"
        return False, None

    def check_room_conflict(self, room_id: str, day: int, start: int, end: int, exclude_interview_id: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """Check if room is unavailable or has an overlapping interview."""
        if room_id.startswith("DUMMY_"):
            return False, None
        room = self.rooms_dict.get(room_id)
        if not room:
            return True, "ROOM_NOT_FOUND"
        if not room.is_available:
            return True, "ROOM_UNAVAILABLE"
            
        for d, s, e, iv_id in self.room_schedules.get(room_id, []):
            if exclude_interview_id and iv_id == exclude_interview_id:
                continue
            if d == day and intervals_overlap(s, e, start, end):
                return True, f"ROOM_CONFLICT: overlaps with interview {iv_id} in {room_id}"
        return False, None

    def check_panel_conflict(self, company_id: str, panel_index: int, day: int, start: int, end: int, exclude_interview_id: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """Check if panel is busy conducting another interview."""
        company = self.companies_dict.get(company_id)
        if not company:
            return True, "COMPANY_NOT_FOUND"
        if panel_index < 1 or panel_index > company.panel_count:
            return True, f"INVALID_PANEL: panel index {panel_index} out of bounds"
            
        for d, s, e, iv_id in self.panel_schedules.get((company_id, panel_index), []):
            if exclude_interview_id and iv_id == exclude_interview_id:
                continue
            if d == day and intervals_overlap(s, e, start, end):
                return True, f"PANEL_CONFLICT: panel {panel_index} busy with {iv_id}"
        return False, None

    def check_company_availability(self, company_id: str, day: int, start: int, end: int) -> Tuple[bool, Optional[str]]:
        """Check if the interview fits inside the company's availabilities."""
        company = self.companies_dict.get(company_id)
        if not company:
            return True, "COMPANY_NOT_FOUND"
            
        # Check if company lists this day in preferred/available days
        if company.preferred_days:
            allowed_days = [int(d.strip()) for d in company.preferred_days.split(",") if d.strip().isdigit()]
            if day not in allowed_days:
                return True, f"COMPANY_UNAVAILABLE_ON_DAY: Day {day} is not in available days {allowed_days}"
                
        # By default, working hours are 09:00 (540) to 17:00 (1020)
        # Check if interview is within day limits
        if start < 540 or end > 1020:
            return True, f"OUTSIDE_WORKING_HOURS: interview {start}-{end} outside 540-1020"
            
        return False, None

    def check_student_eligibility(self, student_id: str, company_id: str) -> Tuple[bool, Optional[str]]:
        """Check if student CGPA satisfies company cutoff."""
        student = self.students_dict.get(student_id)
        company = self.companies_dict.get(company_id)
        if not student or not company:
            return True, "STUDENT_OR_COMPANY_NOT_FOUND"
        if student.cgpa < company.cgpa_cutoff:
            return True, f"INELIGIBLE: Student CGPA {student.cgpa} < Cutoff {company.cgpa_cutoff}"
        return False, None

    def is_feasible(self, student_id: str, company_id: str, panel_index: int, room_id: str, day: int, start: int, end: int, exclude_interview_id: Optional[str] = None) -> Tuple[bool, Optional[str]]:
        """Check all hard constraints for a potential appointment."""
        # 1. Eligibility
        ineligible, reason = self.check_student_eligibility(student_id, company_id)
        if ineligible:
            return False, reason
            
        # 2. Company Availability
        unavailable, reason = self.check_company_availability(company_id, day, start, end)
        if unavailable:
            return False, reason
            
        # 3. Student Conflict
        conflict, reason = self.check_student_conflict(student_id, day, start, end, exclude_interview_id)
        if conflict:
            return False, reason
            
        # 4. Room Conflict
        conflict, reason = self.check_room_conflict(room_id, day, start, end, exclude_interview_id)
        if conflict:
            return False, reason
            
        # 5. Panel Conflict
        conflict, reason = self.check_panel_conflict(company_id, panel_index, day, start, end, exclude_interview_id)
        if conflict:
            return False, reason
            
        return True, None

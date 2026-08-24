from sqlalchemy.orm import Session
from backend.app.models.models import Interview, Room, Company, Student, ScheduleVersion, ScheduleChange, DisruptionEvent
from typing import Dict, Any, List

def calculate_version_metrics(db: Session, version_id: int) -> Dict[str, Any]:
    """Calculate and return all scheduling KPIs for a specific schedule version."""
    # 1. Basic Counts
    interviews = db.query(Interview).filter(Interview.version_id == version_id).all()
    
    total = len(interviews)
    if total == 0:
        return {
            "total_eligible_interviews": 0,
            "scheduled_count": 0,
            "unscheduled_count": 0,
            "completion_percentage": 0.0,
            "student_clashes_count": 0,
            "room_utilization_percentage": 0.0,
            "panel_utilization_percentage": 0.0,
            "average_waiting_time_minutes": 0.0,
            "replan_churn_percentage": 0.0
        }
        
    scheduled = [iv for iv in interviews if iv.status == "SCHEDULED"]
    scheduled_count = len(scheduled)
    unscheduled_count = total - scheduled_count
    completion_pct = (scheduled_count / total) * 100
    
    # 2. Student Clashes (Verify Hard Constraints)
    # Group interviews by student and day
    student_day_schedules = {}
    for iv in scheduled:
        if iv.student_id not in student_day_schedules:
            student_day_schedules[iv.student_id] = {}
        if iv.day not in student_day_schedules[iv.student_id]:
            student_day_schedules[iv.student_id][iv.day] = []
        student_day_schedules[iv.student_id][iv.day].append((iv.start_time, iv.end_time))
        
    clashes_count = 0
    for stud_id, days in student_day_schedules.items():
        for d, times in days.items():
            times.sort()
            for i in range(len(times) - 1):
                if times[i][1] > times[i+1][0]:  # overlap!
                    clashes_count += 1

    # 3. Room Utilization
    rooms = db.query(Room).all()
    num_rooms = len(rooms)
    # Total room capacity (4 days, 8 hours/day = 480 mins/day)
    total_room_minutes = num_rooms * 4 * 480
    
    # Compute sum of scheduled interview minutes
    companies = db.query(Company).all()
    company_durations = {c.id: c.interview_duration for c in companies}
    
    total_scheduled_minutes = sum(company_durations.get(iv.company_id, 30) for iv in scheduled)
    room_utilization = (total_scheduled_minutes / total_room_minutes) * 100 if total_room_minutes > 0 else 0.0

    # 4. Panel Utilization
    total_panels = sum(c.panel_count for c in companies)
    total_panel_minutes = total_panels * 4 * 480
    panel_utilization = (total_scheduled_minutes / total_panel_minutes) * 100 if total_panel_minutes > 0 else 0.0

    # 5. Average Student Waiting Time
    waiting_gaps = []
    for stud_id, days in student_day_schedules.items():
        for d, times in days.items():
            if len(times) > 1:
                times.sort()
                for i in range(len(times) - 1):
                    # Gap is start of next - end of previous
                    gap = times[i+1][0] - times[i][1]
                    if gap >= 0:
                        waiting_gaps.append(gap)
                        
    avg_waiting = sum(waiting_gaps) / len(waiting_gaps) if waiting_gaps else 0.0

    # 6. Replan Churn Percentage
    # Churn is calculated relative to the prior version (e.g. version_id - 1)
    churn_pct = 0.0
    if version_id > 1:
        # Get count of moved/cancelled interviews from ScheduleChange for the disruption that created this version
        disruption = db.query(DisruptionEvent).filter(DisruptionEvent.new_version_id == version_id).first()
        if disruption:
            changes = db.query(ScheduleChange).filter(
                ScheduleChange.disruption_event_id == disruption.id
            ).all()
            
            # Count moved and cancelled
            moved_or_cancelled = sum(1 for c in changes if c.change_type in ("MOVED", "CANCELLED"))
            
            # Get parent scheduled count
            parent_scheduled_count = db.query(Interview).filter(
                Interview.version_id == disruption.old_version_id,
                Interview.status == "SCHEDULED"
            ).count()
            
            if parent_scheduled_count > 0:
                churn_pct = (moved_or_cancelled / parent_scheduled_count) * 100

    return {
        "total_eligible_interviews": total,
        "scheduled_count": scheduled_count,
        "unscheduled_count": unscheduled_count,
        "completion_percentage": round(completion_pct, 2),
        "student_clashes_count": clashes_count,
        "room_utilization_percentage": round(room_utilization, 2),
        "panel_utilization_percentage": round(panel_utilization, 2),
        "average_waiting_time_minutes": round(avg_waiting, 2),
        "replan_churn_percentage": round(churn_pct, 2)
    }

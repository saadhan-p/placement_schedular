from sqlalchemy.orm import Session
from backend.app.models.models import Interview, Student, Company, Room, ScheduleChange, Notification, DisruptionEvent
from backend.app.scheduler.engine import format_time
from typing import Dict, Any, List

def calculate_time_diff_impact(old_start: int, new_start: int) -> str:
    diff = abs(new_start - old_start)
    if new_start > old_start:
        return f"Student interview delayed by {diff} minutes"
    else:
        return f"Student interview advanced by {diff} minutes"

def generate_schedule_diff(db: Session, disruption_event_id: int, old_version_id: int, new_version_id: int) -> Dict[str, Any]:
    """
    Compare schedule versions and generate change diff logs and user notifications.
    Stores results in ScheduleChange and Notification tables.
    """
    # Load interviews
    old_ivs = db.query(Interview).filter(Interview.version_id == old_version_id).all()
    new_ivs = db.query(Interview).filter(Interview.version_id == new_version_id).all()
    
    # Maps for matching
    old_map = {f"{iv.student_id}_{iv.company_id}": iv for iv in old_ivs}
    new_map = {f"{iv.student_id}_{iv.company_id}": iv for iv in new_ivs}
    
    # Load meta descriptions
    student_map = {s.id: s for s in db.query(Student).all()}
    company_map = {c.id: c for c in db.query(Company).all()}
    room_map = {r.id: r for r in db.query(Room).all()}
    
    # Disruption details
    event = db.query(DisruptionEvent).filter(DisruptionEvent.id == disruption_event_id).first()
    disruption_type = event.disruption_type if event else "DISRUPTION"
    
    # Stats
    moved_count = 0
    cancelled_count = 0
    added_count = 0
    unchanged_count = 0
    
    notified_students = set()
    affected_rooms = set()
    affected_panels = set()
    
    changes = []
    notifications = []
    
    all_keys = set(old_map.keys()).union(new_map.keys())
    
    for key in all_keys:
        old_iv = old_map.get(key)
        new_iv = new_map.get(key)
        
        student_id, company_id = key.split("_")
        student = student_map.get(student_id)
        company = company_map.get(company_id)
        
        student_name = student.name if student else "Unknown"
        company_name = company.name if company else "Unknown"
        
        change_type = "UNCHANGED"
        old_start = None
        old_room = None
        old_panel = None
        new_start = None
        new_room = None
        new_panel = None
        reason = f"Resolved {disruption_type}"
        impact = ""
        
        if old_iv and new_iv:
            if old_iv.status == "SCHEDULED" and new_iv.status == "SCHEDULED":
                # Check if moved
                time_changed = old_iv.start_time != new_iv.start_time or old_iv.day != new_iv.day
                room_changed = old_iv.room_id != new_iv.room_id
                panel_changed = old_iv.panel_index != new_iv.panel_index
                
                if time_changed or room_changed or panel_changed:
                    change_type = "MOVED"
                    moved_count += 1
                    old_start = old_iv.start_time
                    old_room = old_iv.room_id
                    old_panel = old_iv.panel_index
                    new_start = new_iv.start_time
                    new_room = new_iv.room_id
                    new_panel = new_iv.panel_index
                    
                    notified_students.add(student_id)
                    if old_room: affected_rooms.add(old_room)
                    if new_room: affected_rooms.add(new_room)
                    affected_panels.add(f"{company_id}_P{old_panel}")
                    affected_panels.add(f"{company_id}_P{new_panel}")
                    
                    if time_changed:
                        if old_iv.day != new_iv.day:
                            impact = f"Student interview moved from Day {old_iv.day} to Day {new_iv.day}"
                        else:
                            impact = calculate_time_diff_impact(old_iv.start_time, new_iv.start_time)
                    elif room_changed:
                        impact = f"Room changed from {old_room} to {new_room}"
                    else:
                        impact = f"Interview panel changed from Panel {old_panel} to Panel {new_panel}"
                else:
                    unchanged_count += 1
                    
            elif old_iv.status == "SCHEDULED" and new_iv.status == "UNSCHEDULED":
                change_type = "CANCELLED"
                cancelled_count += 1
                old_start = old_iv.start_time
                old_room = old_iv.room_id
                old_panel = old_iv.panel_index
                
                notified_students.add(student_id)
                if old_room: affected_rooms.add(old_room)
                affected_panels.add(f"{company_id}_P{old_panel}")
                
                reason = new_iv.failure_reason or f"Cancelled due to {disruption_type}"
                impact = f"Interview could not be scheduled: {new_iv.failure_reason}"
                
            elif old_iv.status == "UNSCHEDULED" and new_iv.status == "SCHEDULED":
                change_type = "ADDED"
                added_count += 1
                new_start = new_iv.start_time
                new_room = new_iv.room_id
                new_panel = new_iv.panel_index
                
                notified_students.add(student_id)
                if new_room: affected_rooms.add(new_room)
                affected_panels.add(f"{company_id}_P{new_panel}")
                impact = f"Interview successfully scheduled at {format_time(new_start)} on Day {new_iv.day}"
                
        elif old_iv and not new_iv:
            # Removed completely (e.g. student withdrawn)
            if old_iv.status == "SCHEDULED":
                change_type = "CANCELLED"
                cancelled_count += 1
                old_start = old_iv.start_time
                old_room = old_iv.room_id
                old_panel = old_iv.panel_index
                notified_students.add(student_id)
                if old_room: affected_rooms.add(old_room)
                impact = "Student interview removed because student withdrew."
                
        elif not old_iv and new_iv:
            # Newly added pairing
            if new_iv.status == "SCHEDULED":
                change_type = "ADDED"
                added_count += 1
                new_start = new_iv.start_time
                new_room = new_iv.room_id
                new_panel = new_iv.panel_index
                notified_students.add(student_id)
                if new_room: affected_rooms.add(new_room)
                impact = "Interview scheduled."

        # Save change record to DB if not UNCHANGED
        if change_type != "UNCHANGED":
            change_rec = ScheduleChange(
                disruption_event_id=disruption_event_id,
                interview_id=new_iv.id if new_iv else old_iv.id,
                change_type=change_type,
                old_start_time=old_start,
                old_room_id=old_room,
                old_panel=old_panel,
                new_start_time=new_start,
                new_room_id=new_room,
                new_panel=new_panel,
                reason=reason,
                impact=impact
            )
            db.add(change_rec)
            
            # Construct Notifications
            old_time_str = f"Day {old_iv.day} at {format_time(old_start)}" if (old_iv and old_start) else "N/A"
            new_time_str = f"Day {new_iv.day} at {format_time(new_start)}" if (new_iv and new_start) else "N/A"
            old_room_name = room_map[old_room].name if (old_room and old_room in room_map) else old_room
            new_room_name = room_map[new_room].name if (new_room and new_room in room_map) else new_room
            
            # Student Notification
            msg_student = ""
            if change_type == "MOVED":
                msg_student = f"Your interview with {company_name} was rescheduled from {old_time_str} ({old_room_name}) to {new_time_str} ({new_room_name}) due to schedule updates ({disruption_type})."
            elif change_type == "CANCELLED":
                msg_student = f"Your interview with {company_name} has been CANCELLED. Reason: {reason}."
            elif change_type == "ADDED":
                msg_student = f"Good news! You have been scheduled for an interview with {company_name} on {new_time_str} in room {new_room_name}."
                
            if msg_student:
                notifications.append(Notification(
                    version_id=new_version_id,
                    recipient_type="STUDENT",
                    recipient_id=student_id,
                    message=msg_student
                ))
                
            # Company/Panel Notification
            msg_company = ""
            if change_type == "MOVED":
                msg_company = f"Interview with student {student_name} rescheduled from {old_time_str} ({old_room_name}, Panel {old_panel}) to {new_time_str} ({new_room_name}, Panel {new_panel})."
            elif change_type == "CANCELLED":
                msg_company = f"Interview with student {student_name} was CANCELLED. Reason: {reason}."
                
            if msg_company:
                notifications.append(Notification(
                    version_id=new_version_id,
                    recipient_type="COMPANY",
                    recipient_id=company_id,
                    message=msg_company
                ))
                
                # Panel notification
                notifications.append(Notification(
                    version_id=new_version_id,
                    recipient_type="PANEL",
                    recipient_id=f"{company_id}_P{new_panel or old_panel}",
                    message=msg_company
                ))
                
            # Save change details for return
            changes.append({
                "interview_id": new_iv.id if new_iv else old_iv.id,
                "student_id": student_id,
                "student_name": student_name,
                "company_id": company_id,
                "company_name": company_name,
                "change_type": change_type,
                "old_start_time": old_start,
                "old_room_id": old_room,
                "old_panel": old_panel,
                "new_start_time": new_start,
                "new_room_id": new_room,
                "new_panel": new_panel,
                "reason": reason,
                "impact": impact
            })

    # Coordinator notification summary
    coord_msg = f"Disruption resolve complete. Moved: {moved_count}, Cancelled: {cancelled_count}, Added: {added_count}. Total churn: {moved_count + cancelled_count} appointments."
    notifications.append(Notification(
        version_id=new_version_id,
        recipient_type="COORDINATOR",
        recipient_id="COORDINATOR",
        message=coord_msg
    ))
    
    db.add_all(notifications)
    db.commit()
    
    # Calculate disruption level
    total_parent_scheduled = sum(1 for iv in old_ivs if iv.status == "SCHEDULED")
    churn_rate = (moved_count + cancelled_count) / total_parent_scheduled if total_parent_scheduled > 0 else 0
    
    if churn_rate < 0.05:
        disruption_level = "LOW"
    elif churn_rate < 0.15:
        disruption_level = "MEDIUM"
    else:
        disruption_level = "HIGH"
        
    return {
        "event_id": disruption_event_id,
        "disruption_type": disruption_type,
        "timestamp": event.timestamp if event else datetime.utcnow(),
        "old_version_id": old_version_id,
        "new_version_id": new_version_id,
        "appointments_moved": moved_count,
        "appointments_cancelled": cancelled_count,
        "appointments_added": added_count,
        "appointments_unchanged": unchanged_count,
        "students_notified": len(notified_students),
        "rooms_affected": len(affected_rooms),
        "panels_affected": len(affected_panels),
        "estimated_disruption": disruption_level,
        "changes": changes
    }

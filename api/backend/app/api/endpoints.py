from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List, Dict, Any, Optional
import json
from backend.app.db import get_db
from backend.app.models.models import Company, Student, Room, Interview, ScheduleVersion, DisruptionEvent, ScheduleChange, Notification
from backend.app.schemas import schemas
from backend.app.scheduler.engine import run_initial_scheduler
from backend.app.replanner.engine import ReplanningEngine
from backend.app.replanner.diff import generate_schedule_diff
from backend.app.metrics.calculator import calculate_version_metrics

router = APIRouter()

@router.get("/companies", response_model=List[schemas.CompanyResponse])
def get_companies(db: Session = Depends(get_db)):
    return db.query(Company).all()

@router.get("/students", response_model=List[schemas.StudentResponse])
def get_students(db: Session = Depends(get_db)):
    return db.query(Student).all()

@router.get("/rooms", response_model=List[schemas.RoomResponse])
def get_rooms(db: Session = Depends(get_db)):
    return db.query(Room).all()

@router.get("/schedule/versions", response_model=List[schemas.ScheduleVersionResponse])
def get_schedule_versions(db: Session = Depends(get_db)):
    return db.query(ScheduleVersion).order_by(ScheduleVersion.id.desc()).all()

@router.get("/schedule", response_model=List[schemas.InterviewResponse])
@router.get("/schedule/{version_id}", response_model=List[schemas.InterviewResponse])
def get_schedule(version_id: Optional[int] = None, db: Session = Depends(get_db)):
    if version_id is None:
        active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
        if not active_version:
            raise HTTPException(status_code=404, detail="No active schedule version found.")
        version_id = active_version.id
        
    return db.query(Interview).filter(Interview.version_id == version_id).all()

@router.get("/metrics", response_model=schemas.DashboardMetricsResponse)
def get_metrics(version_id: Optional[int] = None, db: Session = Depends(get_db)):
    if version_id is None:
        active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
        if not active_version:
            raise HTTPException(status_code=404, detail="No active schedule version found.")
        version_id = active_version.id
        
    return calculate_version_metrics(db, version_id)

@router.get("/conflicts", response_model=List[schemas.InterviewResponse])
def get_conflicts(version_id: Optional[int] = None, db: Session = Depends(get_db)):
    if version_id is None:
        active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
        if not active_version:
            raise HTTPException(status_code=404, detail="No active schedule version found.")
        version_id = active_version.id
        
    return db.query(Interview).filter(
        Interview.version_id == version_id,
        Interview.status == "UNSCHEDULED"
    ).all()

@router.get("/notifications", response_model=List[schemas.NotificationResponse])
def get_notifications(version_id: Optional[int] = None, db: Session = Depends(get_db)):
    if version_id is None:
        active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
        if not active_version:
            raise HTTPException(status_code=404, detail="No active schedule version found.")
        version_id = active_version.id
        
    return db.query(Notification).filter(
        Notification.version_id == version_id
    ).order_by(Notification.id.desc()).all()

@router.post("/schedule/generate")
def generate_schedule(db: Session = Depends(get_db)):
    try:
        # Wipe old schedule versions and interviews
        db.query(Interview).delete()
        db.query(ScheduleVersion).delete()
        db.query(DisruptionEvent).delete()
        db.query(ScheduleChange).delete()
        db.query(Notification).delete()
        db.commit()
        
        # Reset student withdrawal states back to false for clean starts
        db.query(Student).update({Student.withdrawal_status: False, Student.placement_status: "UNPLACED"})
        db.commit()
        
        # Add initial version
        v1 = ScheduleVersion(name="Initial Schedule", is_active=True)
        db.add(v1)
        db.commit()
        db.refresh(v1)
        
        results = run_initial_scheduler(db, version_id=v1.id)
        return {"status": "success", "results": results}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate schedule: {str(e)}")

@router.post("/replan/company-delay", response_model=schemas.ReplanSummaryResponse)
def replan_company_delay(payload: schemas.CompanyDelayInput, db: Session = Depends(get_db)):
    active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
    if not active_version:
        raise HTTPException(status_code=404, detail="No active schedule version found to apply delay.")
        
    try:
        replanner = ReplanningEngine(db, active_version.id)
        new_version, event = replanner.execute_company_delay(
            company_id=payload.company_id,
            day=payload.day,
            delay_minutes=payload.delay_minutes
        )
        
        summary = generate_schedule_diff(db, event.id, active_version.id, new_version.id)
        return summary
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Replanning company delay failed: {str(e)}")

@router.post("/replan/panel-dropout", response_model=schemas.ReplanSummaryResponse)
def replan_panel_dropout(payload: schemas.PanelDropoutInput, db: Session = Depends(get_db)):
    active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
    if not active_version:
        raise HTTPException(status_code=404, detail="No active schedule version found to apply panel dropout.")
        
    try:
        replanner = ReplanningEngine(db, active_version.id)
        new_version, event = replanner.execute_panel_dropout(
            company_id=payload.company_id,
            panel_index=payload.panel_index,
            day=payload.day,
            start_time=payload.start_time,
            end_time=payload.end_time
        )
        
        summary = generate_schedule_diff(db, event.id, active_version.id, new_version.id)
        return summary
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Replanning panel dropout failed: {str(e)}")

@router.post("/replan/student-withdrawal", response_model=schemas.ReplanSummaryResponse)
def replan_student_withdrawal(payload: schemas.StudentWithdrawalInput, db: Session = Depends(get_db)):
    active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
    if not active_version:
        raise HTTPException(status_code=404, detail="No active schedule version found to apply withdrawal.")
        
    try:
        replanner = ReplanningEngine(db, active_version.id)
        new_version, event = replanner.execute_student_withdrawal(student_id=payload.student_id)
        
        summary = generate_schedule_diff(db, event.id, active_version.id, new_version.id)
        return summary
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Replanning student withdrawal failed: {str(e)}")

@router.post("/replan/room-unavailable", response_model=schemas.ReplanSummaryResponse)
def replan_room_unavailable(payload: schemas.RoomUnavailableInput, db: Session = Depends(get_db)):
    active_version = db.query(ScheduleVersion).filter(ScheduleVersion.is_active == True).first()
    if not active_version:
        raise HTTPException(status_code=404, detail="No active schedule version found to apply room outage.")
        
    try:
        replanner = ReplanningEngine(db, active_version.id)
        new_version, event = replanner.execute_room_unavailable(
            room_id=payload.room_id,
            day=payload.day,
            start_time=payload.start_time,
            end_time=payload.end_time
        )
        
        summary = generate_schedule_diff(db, event.id, active_version.id, new_version.id)
        return summary
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Replanning room outage failed: {str(e)}")

@router.get("/replans")
def get_replans(db: Session = Depends(get_db)):
    events = db.query(DisruptionEvent).order_by(DisruptionEvent.timestamp.desc()).all()
    results = []
    for ev in events:
        changes = db.query(ScheduleChange).filter(ScheduleChange.disruption_event_id == ev.id).all()
        moved = sum(1 for c in changes if c.change_type == "MOVED")
        cancelled = sum(1 for c in changes if c.change_type == "CANCELLED")
        added = sum(1 for c in changes if c.change_type == "ADDED")
        
        results.append({
            "id": ev.id,
            "timestamp": ev.timestamp,
            "disruption_type": ev.disruption_type,
            "parameters": json.loads(ev.parameters),
            "old_version_id": ev.old_version_id,
            "new_version_id": ev.new_version_id,
            "moved_count": moved,
            "cancelled_count": cancelled,
            "added_count": added
        })
    return results

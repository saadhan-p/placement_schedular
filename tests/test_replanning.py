import pytest
from backend.app.models.models import Company, Student, Room, Interview, ScheduleVersion, CompanyAvailability, DisruptionEvent, ScheduleChange
from backend.app.scheduler.engine import run_initial_scheduler
from backend.app.replanner.engine import ReplanningEngine
from backend.app.replanner.diff import generate_schedule_diff

def setup_mock_db(db):
    # Rooms
    r1 = Room(id="R001", name="Room 1", is_available=True)
    r2 = Room(id="R002", name="Room 2", is_available=True)
    db.add_all([r1, r2])
    
    # Companies
    c1 = Company(id="C001", name="TechCorp", priority_tier=1, cgpa_cutoff=7.0, interview_duration=30, panel_count=2, preferred_days="1")
    c2 = Company(id="C002", name="ConsultCo", priority_tier=2, cgpa_cutoff=7.0, interview_duration=30, panel_count=1, preferred_days="1")
    db.add_all([c1, c2])
    
    # Students
    s1 = Student(id="S001", name="Alice", branch="CSE", cgpa=9.0, graduation_year=2027, shortlisted_companies="C001,C002", placement_status="UNPLACED")
    s2 = Student(id="S002", name="Bob", branch="ECE", cgpa=8.0, graduation_year=2027, shortlisted_companies="C001,C002", placement_status="UNPLACED")
    db.add_all([s1, s2])
    
    # Availabilities
    db.add(CompanyAvailability(company_id="C001", day=1, start_time=540, end_time=1020))
    db.add(CompanyAvailability(company_id="C002", day=1, start_time=540, end_time=1020))
    
    # Version 1
    v1 = ScheduleVersion(id=1, name="Initial Schedule", is_active=True)
    db.add(v1)
    db.commit()

def test_company_delay_disruption(db_session):
    setup_mock_db(db_session)
    run_initial_scheduler(db_session, version_id=1)
    
    # Company C001 delayed by 60 mins on Day 1 (starts at 600 mins instead of 540)
    replanner = ReplanningEngine(db_session, old_version_id=1)
    new_version, event = replanner.execute_company_delay(company_id="C001", day=1, delay_minutes=60)
    
    assert new_version.id == 2
    assert event.disruption_type == "COMPANY_DELAY"
    
    # Check that interviews for C001 scheduled on Day 1 before 600 are moved or cancelled
    old_interviews = db_session.query(Interview).filter(Interview.version_id == 1, Interview.company_id == "C001", Interview.day == 1).all()
    new_interviews = db_session.query(Interview).filter(Interview.version_id == 2, Interview.company_id == "C001", Interview.day == 1).all()
    
    for new_iv in new_interviews:
        if new_iv.status == "SCHEDULED":
            assert new_iv.start_time >= 600

def test_student_withdrawal_disruption(db_session):
    setup_mock_db(db_session)
    run_initial_scheduler(db_session, version_id=1)
    
    # S001 Alice withdraws
    replanner = ReplanningEngine(db_session, old_version_id=1)
    new_version, event = replanner.execute_student_withdrawal(student_id="S001")
    
    assert new_version.id == 2
    assert event.disruption_type == "STUDENT_WITHDRAWAL"
    
    # All S001 interviews in new version must be UNSCHEDULED
    s1_interviews = db_session.query(Interview).filter(Interview.version_id == 2, Interview.student_id == "S001").all()
    for iv in s1_interviews:
        assert iv.status == "UNSCHEDULED"
        assert iv.blocking_constraint == "STUDENT_WITHDRAWAL"

def test_room_unavailable_disruption(db_session):
    setup_mock_db(db_session)
    run_initial_scheduler(db_session, version_id=1)
    
    # Room R001 becomes unavailable on Day 1 from 9:00 AM (540) to 10:00 AM (600)
    replanner = ReplanningEngine(db_session, old_version_id=1)
    new_version, event = replanner.execute_room_unavailable(room_id="R001", day=1, start_time=540, end_time=600)
    
    assert new_version.id == 2
    
    # Check that no scheduled interview is in R001 on Day 1 between 540 and 600
    interviews_r1 = db_session.query(Interview).filter(
        Interview.version_id == 2,
        Interview.room_id == "R001",
        Interview.day == 1,
        Interview.status == "SCHEDULED"
    ).all()
    
    for iv in interviews_r1:
        assert not (iv.start_time < 600 and iv.end_time > 540)

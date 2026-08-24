import pytest
from backend.app.models.models import Company, Student, Room, Interview, ScheduleVersion, CompanyAvailability
from backend.app.scheduler.engine import run_initial_scheduler
from backend.app.scheduler.constraints import ConstraintChecker

def test_initial_scheduler_and_constraints(db_session):
    # 1. Seed dummy data
    room1 = Room(id="R001", name="Room 1", is_available=True)
    room2 = Room(id="R002", name="Room 2", is_available=True)
    
    comp1 = Company(
        id="C001", 
        name="TechCorp", 
        priority_tier=1, 
        cgpa_cutoff=8.0, 
        interview_duration=30, 
        panel_count=2, 
        preferred_days="1,2"
    )
    comp2 = Company(
        id="C002", 
        name="ConsultCo", 
        priority_tier=2, 
        cgpa_cutoff=7.0, 
        interview_duration=45, 
        panel_count=1, 
        preferred_days="1"
    )
    
    stud1 = Student(
        id="S001", 
        name="Alice", 
        branch="CSE", 
        cgpa=8.5, 
        graduation_year=2027, 
        shortlisted_companies="C001,C002", 
        placement_status="UNPLACED"
    )
    stud2 = Student(
        id="S002", 
        name="Bob", 
        branch="ECE", 
        cgpa=7.5, 
        graduation_year=2027, 
        shortlisted_companies="C001,C002", 
        placement_status="UNPLACED"
    )
    
    db_session.add_all([room1, room2, comp1, comp2, stud1, stud2])
    db_session.commit()
    
    # Add availabilities
    db_session.add(CompanyAvailability(company_id="C001", day=1, start_time=540, end_time=1020))
    db_session.add(CompanyAvailability(company_id="C001", day=2, start_time=540, end_time=1020))
    db_session.add(CompanyAvailability(company_id="C002", day=1, start_time=540, end_time=1020))
    db_session.commit()
    
    # Create version
    v1 = ScheduleVersion(id=1, name="Initial Version", is_active=True)
    db_session.add(v1)
    db_session.commit()
    
    # 2. Run scheduler
    results = run_initial_scheduler(db_session, version_id=1)
    
    assert results["total"] == 4  # Alice shortlisted for C001, C002. Bob shortlisted for C001, C002
    
    # Query scheduled interviews
    scheduled = db_session.query(Interview).filter(Interview.version_id == 1, Interview.status == "SCHEDULED").all()
    unscheduled = db_session.query(Interview).filter(Interview.version_id == 1, Interview.status == "UNSCHEDULED").all()
    
    # Bob has CGPA 7.5, C001 has cutoff 8.0, so Bob must be ineligible for C001
    bob_c001 = next((iv for iv in unscheduled if iv.student_id == "S002" and iv.company_id == "C001"), None)
    assert bob_c001 is not None
    assert "cutoff" in bob_c001.failure_reason or "CGPA" in bob_c001.failure_reason
    assert bob_c001.blocking_constraint == "INELIGIBILITY"
    
    # Check hard constraints in scheduled interviews
    checker = ConstraintChecker([room1, room2], [comp1, comp2], [stud1, stud2])
    checker.load_existing_interviews(scheduled)
    
    # Ensure no overlaps
    for iv in scheduled:
        # Check student overlap
        stud_conf, _ = checker.check_student_conflict(iv.student_id, iv.day, iv.start_time, iv.end_time, exclude_interview_id=iv.id)
        assert not stud_conf
        
        # Check room overlap
        room_conf, _ = checker.check_room_conflict(iv.room_id, iv.day, iv.start_time, iv.end_time, exclude_interview_id=iv.id)
        assert not room_conf
        
        # Check panel overlap
        panel_conf, _ = checker.check_panel_conflict(iv.company_id, iv.panel_index, iv.day, iv.start_time, iv.end_time, exclude_interview_id=iv.id)
        assert not panel_conf

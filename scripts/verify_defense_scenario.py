import sys
import os

# Adjust Python path to find the backend app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.app.database import SessionLocal, Base, engine
from backend.app.scheduler.engine import run_initial_scheduler
from backend.app.replanner.engine import ReplanningEngine
from backend.app.replanner.diff import generate_schedule_diff
from backend.app.metrics.calculator import calculate_version_metrics
from backend.app.models.models import Interview, Student

def print_metrics(metrics, version_title):
    print(f"\n--- METRICS: {version_title} ---")
    print(f"Total Eligible: {metrics['total_eligible_interviews']}")
    print(f"Scheduled:      {metrics['scheduled_count']} ({metrics['completion_percentage']}%)")
    print(f"Unscheduled:    {metrics['unscheduled_count']}")
    print(f"Student Clashes: {metrics['student_clashes_count']}")
    print(f"Room Util %:    {metrics['room_utilization_percentage']}%")
    print(f"Panel Util %:   {metrics['panel_utilization_percentage']}%")
    print(f"Avg Wait Time:  {metrics['average_waiting_time_minutes']} mins")
    print(f"Replan Churn:   {metrics['replan_churn_percentage']}%")

def main():
    print("Initializing Defense Scenario Simulation...")
    db = SessionLocal()
    try:
        # Step 1: Initial Schedule
        print("\nStep 1: Generating Initial Schedule (Version 1)...")
        results = run_initial_scheduler(db, version_id=1)
        m1 = calculate_version_metrics(db, 1)
        print_metrics(m1, "Version 1 - Initial")
        
        # Step 2: Recruiter Delay
        # Biggest recruiter is C001 (Google in seed 42)
        print("\nStep 2: Simulating Google (C001) delayed by 3 hours (180 mins) on Day 1...")
        replanner = ReplanningEngine(db, old_version_id=1)
        v2, event2 = replanner.execute_company_delay(company_id="C001", day=1, delay_minutes=180)
        diff2 = generate_schedule_diff(db, event2.id, 1, v2.id)
        m2 = calculate_version_metrics(db, v2.id)
        print_metrics(m2, f"Version 2 - Google Delayed (Impact: {diff2['estimated_disruption']})")
        print(f"Appointments Moved: {diff2['appointments_moved']}, Cancelled: {diff2['appointments_cancelled']}")
        
        # Step 3: Google Panel 1 drops out on Day 1 from 12:00 PM (720 mins) to 02:00 PM (840 mins)
        print("\nStep 3: Simulating Google (C001) Panel 1 dropout on Day 1 from 12:00 PM to 02:00 PM...")
        replanner3 = ReplanningEngine(db, old_version_id=v2.id)
        v3, event3 = replanner3.execute_panel_dropout(company_id="C001", panel_index=1, day=1, start_time=720, end_time=840)
        diff3 = generate_schedule_diff(db, event3.id, v2.id, v3.id)
        m3 = calculate_version_metrics(db, v3.id)
        print_metrics(m3, f"Version 3 - Google Panel 1 Dropout (Impact: {diff3['estimated_disruption']})")
        print(f"Appointments Moved: {diff3['appointments_moved']}, Cancelled: {diff3['appointments_cancelled']}")
        
        # Step 4: 15 students withdraw
        # Get first 15 students
        students = db.query(Student).filter(Student.withdrawal_status == False).limit(15).all()
        student_ids = [s.id for s in students]
        print(f"\nStep 4: Simulating withdrawal of 15 students: {', '.join(student_ids)}...")
        
        # Apply sequential student withdrawals
        current_version_id = v3.id
        for s_id in student_ids:
            replanner_w = ReplanningEngine(db, old_version_id=current_version_id)
            v_next, event_w = replanner_w.execute_student_withdrawal(student_id=s_id)
            generate_schedule_diff(db, event_w.id, current_version_id, v_next.id)
            current_version_id = v_next.id
            
        m4 = calculate_version_metrics(db, current_version_id)
        print_metrics(m4, f"Version {current_version_id} - After 15 Withdrawals")
        
        # Step 5: Verify constraints
        print("\nStep 5: Verifying hard constraints on final version...")
        assert m4["student_clashes_count"] == 0, "Hard constraint violation: Student clash detected!"
        print("Success: Final schedule is completely conflict-free. No student clashes!")
        
    finally:
        db.close()

if __name__ == "__main__":
    main()

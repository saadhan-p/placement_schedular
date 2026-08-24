import sys
import os

# Adjust Python path to find the backend app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.app.database import SessionLocal
from backend.app.scheduler.engine import run_initial_scheduler

def main():
    print("Generating Initial Placement Schedule (Version 1)...")
    db = SessionLocal()
    try:
        results = run_initial_scheduler(db, version_id=1)
        print("\n--- SCHEDULING COMPLETE ---")
        print(f"Total Eligible Interviews: {results['total']}")
        print(f"Successfully Scheduled:    {results['scheduled']}")
        print(f"Unscheduled (Infeasible):  {results['unscheduled']}")
        completion_rate = (results['scheduled'] / results['total']) * 100 if results['total'] > 0 else 0
        print(f"Schedule Completion Rate:  {completion_rate:.2f}%")
        print("Initial schedule version 1 saved to database.")
    except Exception as e:
        print(f"Error during scheduling: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    main()

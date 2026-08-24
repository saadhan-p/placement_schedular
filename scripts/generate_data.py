import argparse
import random
import sys
import os
from datetime import datetime

# Adjust Python path to find the backend app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from backend.app.database import engine, SessionLocal, Base
from backend.app.models.models import Company, Student, Room, CompanyAvailability, ScheduleVersion

# Names for generating realistic students and companies
FIRST_NAMES = [
    "Aarav", "Aditya", "Akash", "Ananya", "Arjun", "Dev", "Diya", "Ishaan", "Kabir", "Meera",
    "Neha", "Pranav", "Rohan", "Sanjana", "Siddharth", "Tanya", "Utkarsh", "Varun", "Yash", "Zoya",
    "Alex", "Emma", "Liam", "Olivia", "Noah", "Ava", "Ethan", "Sophia", "Mason", "Isabella",
    "James", "Mia", "Benjamin", "Charlotte", "Jacob", "Amelia", "William", "Harper", "Michael", "Evelyn"
]

LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Patel", "Mehta", "Joshi", "Rao", "Nair", "Reddy", "Choudhury",
    "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez",
    "Kumar", "Singh", "Das", "Sen", "Roy", "Bose", "Chatterjee", "Banerjee", "Mishra", "Pandey"
]

COMPANY_NAMES = [
    "Google", "Microsoft", "Amazon", "Apple", "Meta", "Netflix", "NVIDIA", "Intel", "AMD", "Qualcomm",
    "Adobe", "Salesforce", "Oracle", "SAP", "Cisco", "IBM", "TCS", "Infosys", "Wipro", "Cognizant",
    "Accenture", "Capgemini", "Deloitte", "PwC", "EY", "KPMG", "JPMorgan Chase", "Goldman Sachs", "Morgan Stanley",
    "Uber", "Lyft", "Airbnb", "Stripe", "SpaceX", "Tesla"
]

BRANCHES = ["CSE", "ISE", "ECE", "EEE", "ME", "AI/ML", "Data Science"]

def generate_realistic_data(seed: int, num_companies: int, num_students: int, num_rooms: int, days: int):
    # Set seeds
    random.seed(seed)
    
    print(f"Generating realistic placement data (Seed: {seed})...")
    print(f"Target: {num_companies} companies, {num_students} students, {num_rooms} rooms, {days} days.")

    # 1. Generate Rooms
    rooms = []
    locations = ["Block A, Floor 1", "Block A, Floor 2", "Block B, Floor 1", "Block B, Floor 2", "Placement Cell"]
    for i in range(1, num_rooms + 1):
        room_id = f"R{i:03d}"
        rooms.append(Room(
            id=room_id,
            name=f"Interview Room {i}",
            capacity=1 if random.random() < 0.9 else 2,  # Most are single interview rooms
            location=random.choice(locations),
            is_available=True
        ))

    # 2. Generate Companies
    companies = []
    availabilities = []
    
    # We want realistic company profiles:
    # - Day-1 mass recruiters (Tier 3 or Tier 2, low CGPA cutoff, many panels, short interviews, large shortlists)
    # - Tier 1 elite (high CGPA cutoff, fewer panels, longer interviews, small shortlists)
    # - Tier 2/3 regular companies (medium cutoffs, mid-range shortlists)
    
    for i, name in enumerate(COMPANY_NAMES[:num_companies]):
        comp_id = f"C{i+1:03d}"
        
        # Decide profile based on index
        if i == 0 or i == 1:  # Mass Recruiters (e.g. TCS, Infosys)
            priority_tier = 3
            cgpa_cutoff = 6.0
            interview_duration = 30
            panel_count = 8
            expected_shortlist_count = 250
            preferred_days = "1"
        elif i < 7:  # Tier 1 Elite (e.g. Google, Microsoft, Goldman Sachs)
            priority_tier = 1
            cgpa_cutoff = 8.5
            interview_duration = 45 if random.random() < 0.5 else 60
            panel_count = random.randint(2, 4)
            expected_shortlist_count = random.randint(40, 70)
            preferred_days = "1,2"
        elif i < 20:  # Tier 2 Mid-tier
            priority_tier = 2
            cgpa_cutoff = 7.0 + random.random() * 1.0  # 7.0 to 8.0
            interview_duration = 30 if random.random() < 0.7 else 45
            panel_count = random.randint(2, 4)
            expected_shortlist_count = random.randint(50, 100)
            preferred_days = "2,3"
        else:  # Tier 3 Standard
            priority_tier = 3
            cgpa_cutoff = 6.0 + random.random() * 1.5  # 6.0 to 7.5
            interview_duration = 30
            panel_count = random.randint(1, 2)
            expected_shortlist_count = random.randint(30, 60)
            preferred_days = "3,4"

        # Overwrite list to contain exact settings if not matching names length
        company = Company(
            id=comp_id,
            name=name,
            priority_tier=priority_tier,
            cgpa_cutoff=round(cgpa_cutoff, 2),
            interview_duration=interview_duration,
            panel_count=panel_count,
            expected_shortlist_count=expected_shortlist_count,
            preferred_days=preferred_days
        )
        companies.append(company)

        # Generate Availability for preferred days (or default all days)
        pref_days_list = [int(d) for d in preferred_days.split(",")] if preferred_days else list(range(1, days + 1))
        for d in pref_days_list:
            # 09:00 AM (540 mins) to 05:00 PM (1020 mins)
            availabilities.append(CompanyAvailability(
                company_id=comp_id,
                day=d,
                start_time=540,
                end_time=1020
            ))

    # 3. Generate Students with realistic CGPA (normal distribution truncated)
    students = []
    
    # Generate student CGPAs using a normal distribution centered around 7.8, std dev 1.0
    cgpa_list = []
    while len(cgpa_list) < num_students:
        val = random.normalvariate(7.8, 0.95)
        if 5.0 <= val <= 10.0:
            cgpa_list.append(round(val, 2))
    
    # Sort CGPAs to assign high CGPAs to some top students
    cgpa_list.sort(reverse=True)
    
    # Create students
    for i in range(1, num_students + 1):
        stud_id = f"S{i:04d}"
        first_name = random.choice(FIRST_NAMES)
        last_name = random.choice(LAST_NAMES)
        name = f"{first_name} {last_name}"
        branch = random.choice(BRANCHES)
        cgpa = cgpa_list[i-1]
        
        # Decide shortlists based on CGPA and company cutoffs
        shortlisted_ids = []
        
        # Determine candidate companies based on CGPA eligibility
        eligible_companies = [c for c in companies if cgpa >= c.cgpa_cutoff]
        
        if eligible_companies:
            # High-CGPA students have a higher probability of being shortlisted by Tier 1 and more companies
            if cgpa >= 9.0:
                # Top student: shortlisted by 5 to 10 companies (causes high conflict!)
                num_shortlists = random.randint(5, 9)
            elif cgpa >= 8.0:
                # Good student: 3 to 6 companies
                num_shortlists = random.randint(3, 6)
            elif cgpa >= 7.0:
                # Average student: 2 to 4 companies
                num_shortlists = random.randint(2, 4)
            else:
                # Below average: 1 to 2 companies
                num_shortlists = random.randint(1, 2)
            
            # Select companies, biasing towards company's expected_shortlist_count and priorities
            # We construct weights for random selection
            weights = []
            for c in eligible_companies:
                w = c.expected_shortlist_count
                if c.priority_tier == 1:
                    w *= 1.5  # Higher priority companies are highly sought after
                weights.append(w)
            
            # Draw without replacement
            num_to_draw = min(num_shortlists, len(eligible_companies))
            if num_to_draw > 0:
                chosen = random.choices(eligible_companies, weights=weights, k=num_to_draw * 2)
                # Keep unique
                unique_chosen = []
                for c in chosen:
                    if c not in unique_chosen:
                        unique_chosen.append(c)
                    if len(unique_chosen) == num_to_draw:
                        break
                shortlisted_ids = [c.id for c in unique_chosen]

        students.append(Student(
            id=stud_id,
            name=name,
            branch=branch,
            cgpa=cgpa,
            graduation_year=2027,
            shortlisted_companies=",".join(shortlisted_ids),
            placement_status="UNPLACED",
            withdrawal_status=False
        ))

    # Print summary statistics
    print("\n--- DATA GENERATION STATS ---")
    print(f"Total Rooms: {len(rooms)}")
    print(f"Total Companies: {len(companies)}")
    print(f"Total Students: {len(students)}")
    
    # Compute shortlist counts
    shortlist_counts = [len(s.shortlisted_companies.split(",")) if s.shortlisted_companies else 0 for s in students]
    print(f"Max shortlists per student: {max(shortlist_counts)}")
    print(f"Avg shortlists per student: {sum(shortlist_counts)/len(students):.2f}")
    
    # Check eligibility of students
    company_shortlists = {c.id: 0 for c in companies}
    for s in students:
        if s.shortlisted_companies:
            for cid in s.shortlisted_companies.split(","):
                if cid in company_shortlists:
                    company_shortlists[cid] += 1
                    
    print("\nSample Company Shortlist Counts:")
    for c in companies[:10]:
        print(f"  {c.name} (Tier {c.priority_tier}, Cutoff {c.cgpa_cutoff}): target={c.expected_shortlist_count}, actual_shortlisted={company_shortlists[c.id]}, panels={c.panel_count}")
    
    # Write to database
    db = SessionLocal()
    try:
        # Clear existing data
        db.query(CompanyAvailability).delete()
        db.query(Room).delete()
        db.query(Student).delete()
        db.query(Company).delete()
        db.query(ScheduleVersion).delete()
        db.commit()
        
        # Add generated items
        db.add_all(rooms)
        db.add_all(companies)
        db.add_all(students)
        db.add_all(availabilities)
        
        # Create initial schedule version record
        initial_version = ScheduleVersion(
            id=1,
            name="Initial Schedule",
            created_at=datetime.utcnow(),
            is_active=True
        )
        db.add(initial_version)
        
        db.commit()
        print("\nDatabase seeded successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate realistic placement data")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducibility")
    parser.add_argument("--companies", type=int, default=35, help="Number of companies to generate")
    parser.add_argument("--students", type=int, default=800, help="Number of students to generate")
    parser.add_argument("--rooms", type=int, default=20, help="Number of rooms to generate")
    parser.add_argument("--days", type=int, default=4, help="Number of days in placement week")
    
    args = parser.parse_args()
    
    # Initialize DB tables
    Base.metadata.create_all(bind=engine)
    
    generate_realistic_data(
        seed=args.seed,
        num_companies=args.companies,
        num_students=args.students,
        num_rooms=args.rooms,
        days=args.days
    )

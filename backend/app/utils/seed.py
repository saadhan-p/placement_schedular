import random
from datetime import datetime
from sqlalchemy.orm import Session
from backend.app.database import SessionLocal
from backend.app.models.models import Company, Student, Room, CompanyAvailability, ScheduleVersion

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

def seed_database_if_empty():
    db = SessionLocal()
    try:
        # Check if already seeded
        if db.query(Company).count() > 0:
            return  # Already seeded
            
        print("Database is empty. Auto-seeding realistic placement data (Seed: 42)...")
        random.seed(42)
        
        # 1. Rooms
        rooms = []
        locations = ["Block A, Floor 1", "Block A, Floor 2", "Block B, Floor 1", "Block B, Floor 2", "Placement Cell"]
        for i in range(1, 21):
            rooms.append(Room(
                id=f"R{i:03d}",
                name=f"Interview Room {i}",
                capacity=1 if random.random() < 0.9 else 2,
                location=random.choice(locations),
                is_available=True
            ))
        db.add_all(rooms)

        # 2. Companies
        companies = []
        availabilities = []
        for i, name in enumerate(COMPANY_NAMES[:35]):
            comp_id = f"C{i+1:03d}"
            if i == 0 or i == 1:  # Mass Recruiters
                priority_tier = 3
                cgpa_cutoff = 6.0
                interview_duration = 30
                panel_count = 8
                expected_shortlist_count = 250
                preferred_days = "1"
            elif i < 7:  # Tier 1 Elite
                priority_tier = 1
                cgpa_cutoff = 8.5
                interview_duration = 45 if random.random() < 0.5 else 60
                panel_count = random.randint(2, 4)
                expected_shortlist_count = random.randint(40, 70)
                preferred_days = "1,2"
            elif i < 20:  # Tier 2
                priority_tier = 2
                cgpa_cutoff = 7.0 + random.random() * 1.0
                interview_duration = 30 if random.random() < 0.7 else 45
                panel_count = random.randint(2, 4)
                expected_shortlist_count = random.randint(50, 100)
                preferred_days = "2,3"
            else:  # Tier 3
                priority_tier = 3
                cgpa_cutoff = 6.0 + random.random() * 1.5
                interview_duration = 30
                panel_count = random.randint(1, 2)
                expected_shortlist_count = random.randint(30, 60)
                preferred_days = "3,4"

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

            pref_days_list = [int(d) for d in preferred_days.split(",")] if preferred_days else [1, 2, 3, 4]
            for d in pref_days_list:
                availabilities.append(CompanyAvailability(
                    company_id=comp_id,
                    day=d,
                    start_time=540,
                    end_time=1020
                ))
        db.add_all(companies)
        db.add_all(availabilities)

        # 3. Students
        students = []
        cgpa_list = []
        while len(cgpa_list) < 800:
            val = random.normalvariate(7.8, 0.95)
            if 5.0 <= val <= 10.0:
                cgpa_list.append(round(val, 2))
        cgpa_list.sort(reverse=True)

        for i in range(1, 801):
            stud_id = f"S{i:04d}"
            name = f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"
            branch = random.choice(BRANCHES)
            cgpa = cgpa_list[i-1]
            
            eligible_companies = [c for c in companies if cgpa >= c.cgpa_cutoff]
            shortlisted_ids = []
            if eligible_companies:
                if cgpa >= 9.0:
                    num_shortlists = random.randint(5, 9)
                elif cgpa >= 8.0:
                    num_shortlists = random.randint(3, 6)
                elif cgpa >= 7.0:
                    num_shortlists = random.randint(2, 4)
                else:
                    num_shortlists = random.randint(1, 2)
                
                weights = [c.expected_shortlist_count * (1.5 if c.priority_tier == 1 else 1.0) for c in eligible_companies]
                num_to_draw = min(num_shortlists, len(eligible_companies))
                if num_to_draw > 0:
                    chosen = random.choices(eligible_companies, weights=weights, k=num_to_draw * 2)
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
        db.add_all(students)

        # 4. Schedule Version 1
        initial_version = ScheduleVersion(
            name="Initial Schedule",
            created_at=datetime.utcnow(),
            is_active=True
        )
        db.add(initial_version)

        db.commit()
        print("Auto-seeding completed successfully!")
    except Exception as e:
        db.rollback()
        print(f"Error seeding database: {e}")
    finally:
        db.close()

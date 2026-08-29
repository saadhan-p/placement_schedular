import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

import urllib.parse

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///backend/placement_scheduler.db")

# Handle Vercel/Supabase 'postgres://' connection string format deprecated in SQLAlchemy
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# Safely encode special characters in the database password (common Supabase connection string issue)
if DATABASE_URL.startswith("postgresql"):
    try:
        # Split scheme
        scheme, rest = DATABASE_URL.split("://", 1)
        # Split credentials from host using the last '@' symbol
        if "@" in rest:
            creds, host_part = rest.rsplit("@", 1)
            if ":" in creds:
                username, password = creds.split(":", 1)
                # Percent-encode the password
                encoded_password = urllib.parse.quote_plus(password)
                # Reconstruct the connection string
                DATABASE_URL = f"{scheme}://{username}:{encoded_password}@{host_part}"
    except Exception as e:
        print(f"Error parsing/encoding DATABASE_URL: {e}")

# Check if database is SQLite to apply connection parameters
is_sqlite = DATABASE_URL.startswith("sqlite")

connect_args = {}
if is_sqlite:
    # Ensure the backend directory exists
    os.makedirs("backend", exist_ok=True)
    connect_args["check_same_thread"] = False

engine = create_engine(
    DATABASE_URL, 
    connect_args=connect_args
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

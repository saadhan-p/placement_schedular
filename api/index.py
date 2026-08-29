import os
import sys

# Add the api/ directory to sys.path to find the copied backend package
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from backend.app.main import app

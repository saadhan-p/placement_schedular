import os
import json
import subprocess
import urllib.request
import urllib.parse

API_KEY = os.environ.get("STITCH_API_KEY", "")
PROJECT_ID = os.environ.get("STITCH_PROJECT_ID", "12586696167406884376")
OUTPUT_DIR = "/Users/saadhan/Drive/Projects/Placement Week Scheduler/scratch_stitch"

os.makedirs(OUTPUT_DIR, exist_ok=True)

# Run list_screens
print("Listing screens...")
env = os.environ.copy()
env["STITCH_API_KEY"] = API_KEY

cmd = [
    "npx",
    "@_davideast/stitch-mcp",
    "tool",
    "list_screens",
    "-d",
    json.dumps({"projectId": PROJECT_ID})
]

result = subprocess.run(cmd, env=env, capture_output=True, text=True)
if result.returncode != 0:
    print("Failed to list screens:")
    print(result.stderr)
    exit(1)

try:
    screens_data = json.loads(result.stdout)
except Exception as e:
    print("Failed to parse screens JSON:", e)
    print("Output was:")
    print(result.stdout)
    exit(1)

# The CLI output might contain extra text around the JSON.
# If parser failed, we might need to extract the JSON.
# Let's see if we got the list directly.
if isinstance(screens_data, dict) and "screens" in screens_data:
    screens = screens_data["screens"]
elif isinstance(screens_data, list):
    screens = screens_data
else:
    # Try to find JSON block in stdout if it wasn't clean JSON
    import re
    match = re.search(r'(\{.*\}|\[.*\])', result.stdout, re.DOTALL)
    if match:
        screens_data = json.loads(match.group(1))
        screens = screens_data.get("screens", [])
    else:
        print("Could not find JSON in output:")
        print(result.stdout)
        exit(1)

print(f"Found {len(screens)} screens.")

for screen in screens:
    title = screen.get("title", "Untitled")
    screen_id = screen.get("name", "").split("/")[-1]
    print(f"\nProcessing screen: {title} ({screen_id})")
    
    html_info = screen.get("htmlCode", {})
    download_url = html_info.get("downloadUrl")
    if not download_url:
        print(f"No HTML download URL for {title}")
        continue
        
    print(f"Downloading from: {download_url}")
    
    # Save slugified title
    slug = "".join([c if c.isalnum() or c in " _-" else "_" for c in title]).strip().replace(" ", "_").lower()
    dest_path = os.path.join(OUTPUT_DIR, f"{slug}.html")
    
    try:
        req = urllib.request.Request(
            download_url,
            headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req) as response:
            html_content = response.read()
            with open(dest_path, "wb") as f:
                f.write(html_content)
        print(f"Saved to {dest_path} ({len(html_content)} bytes)")
    except Exception as e:
        print(f"Failed to download {title}: {e}")

print("\nDone downloading screens!")

import subprocess
import sys

def deploy():
    print("Starting deployment to Cloudflare Pages...")
    try:
        # Command to deploy via Wrangler CLI using npx
        # --project-name defines the project in Cloudflare
        command = ["npx", "wrangler", "pages", "deploy", ".", "--project-name", "monochrome-diary"]
        
        # Using shell=True for Windows environment
        # The first run will likely prompt for authentication and project creation
        result = subprocess.run(command, capture_output=False, text=True, shell=True)
        
        if result.returncode == 0:
            print("\nDeployment process completed successfully!")
        else:
            print("\nDeployment failed or was cancelled.")
            sys.exit(1)
            
    except Exception as e:
        print(f"An error occurred: {e}")
        sys.exit(1)

if __name__ == "__main__":
    deploy()

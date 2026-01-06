import os
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse
import argparse
import sys
import re

def is_valid_url(url):
    """
    Checks if a URL is valid (http/https).
    """
    parsed = urlparse(url)
    return bool(parsed.netloc) and bool(parsed.scheme) and parsed.scheme in ['http', 'https']

def get_filename_from_cd(cd):
    """
    Get filename from content-disposition
    """
    if not cd:
        return None
    fname = re.findall('filename=(.+)', cd)
    if len(fname) == 0:
        return None
    return fname[0].strip('"\'')

def get_filename(url, response):
    """
    Determine the filename from the URL or response headers.
    """
    # Try content-disposition
    if "Content-Disposition" in response.headers:
        fname = get_filename_from_cd(response.headers.get("Content-Disposition"))
        if fname:
            return fname

    # Fallback to URL path
    path = urlparse(url).path
    fname = os.path.basename(path)
    if not fname:
        # Default if no filename in path
        return "index.html"
    return fname

def download_file(url, folder):
    """
    Downloads a file from a URL to the specified folder.
    """
    try:
        # Stream the download to handle large files
        with requests.get(url, stream=True, timeout=10) as response:
            response.raise_for_status()
            
            filename = get_filename(url, response)
            # Clean filename
            filename = "".join([c for c in filename if c.isalpha() or c.isdigit() or c in "._- "]).strip()
            if not filename:
                filename = "downloaded_file"

            filepath = os.path.join(folder, filename)
            
            # Handle duplicates by renaming
            base, ext = os.path.splitext(filepath)
            counter = 1
            while os.path.exists(filepath):
                filepath = f"{base}_{counter}{ext}"
                counter += 1

            print(f"Downloading {url} to {filepath}...")
            
            with open(filepath, 'wb') as f:
                for chunk in response.iter_content(chunk_size=8192):
                    if chunk:
                        f.write(chunk)
            print(f"Saved: {filepath}")
            
    except Exception as e:
        print(f"Failed to download {url}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Download all files linked from a website.")
    parser.add_argument("url", help="The URL of the website to scrape.")
    parser.add_argument("-o", "--output", default="downloads", help="Output directory for downloaded files.")
    
    args = parser.parse_args()
    
    target_url = args.url
    output_dir = args.output

    if not os.path.exists(output_dir):
        os.makedirs(output_dir)

    print(f"Scanning {target_url}...")
    
    try:
        response = requests.get(target_url, timeout=15)
        response.raise_for_status()
    except Exception as e:
        print(f"Error accessing website: {e}")
        sys.exit(1)

    soup = BeautifulSoup(response.content, "html.parser")
    
    # Find all links
    links = set()
    for tag in soup.find_all('a', href=True):
        href = tag['href']
        full_url = urljoin(target_url, href)
        
        # Simple filtering
        if is_valid_url(full_url):
            # Avoid downloading the page itself again recursively if it links to itself
            # checking fragment
            if full_url.split('#')[0] == target_url.split('#')[0]:
                 continue
            links.add(full_url)

    print(f"Found {len(links)} unique links.")
    
    for link in links:
        download_file(link, output_dir)

if __name__ == "__main__":
    main()

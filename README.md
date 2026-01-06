## Website file downloader

`website_file_downloader.py` crawls a website starting from a URL, finds linked files (by common extensions and/or Content-Type), and downloads them to a local folder while mirroring the site’s path structure.

### Setup

```bash
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
```

### Usage

Download files linked from the starting page (and pages one click away), staying on the same host:

```bash
python website_file_downloader.py "https://example.com" --depth 1 --output downloads
```

Only scan the starting page (no crawling):

```bash
python website_file_downloader.py "https://example.com" --depth 0
```

Be polite (sleep between requests) and use Content-Type detection:

```bash
python website_file_downloader.py "https://example.com" --sleep 0.5 --detect-by-content-type
```

Add additional file extensions to treat as “downloadable files”:

```bash
python website_file_downloader.py "https://example.com" --ext .apk --ext .iso
```

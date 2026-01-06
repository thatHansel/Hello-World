# Document Downloader Chrome Extension

A simple Chrome extension that downloads PDFs and documents from the current page and all linked pages (one level deep).

## Features

- Downloads PDFs and common document formats (.pdf, .doc, .docx, .xls, .xlsx, .ppt, .pptx, .txt, .rtf, .odt, .ods, .odp, .csv)
- Follows links one level deep to find more documents
- Stays on the same domain only (no cross-domain scanning)
- Skips duplicate files
- Maximum of 500 files per scan
- Simple, clean user interface

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" in the top right corner
3. Click "Load unpacked"
4. Select the `chrome-extension-file-downloader` folder
5. The extension icon will appear in your toolbar

## Usage

1. Navigate to a webpage you want to scan
2. Click the Document Downloader extension icon
3. Click "Start Download"
4. The extension will:
   - Scan the current page for documents
   - Find all linked pages on the same domain
   - Scan those linked pages for documents (one level deep)
   - Download all unique documents found

Downloaded files will be saved to a `downloaded-documents` folder in your default Chrome downloads location.

## How It Works

1. **Current Page Scan**: Extracts all document links from the current page
2. **Link Discovery**: Finds all links to other pages on the same domain
3. **Deep Scan**: Opens each linked page (in background tabs) and scans for documents
4. **Download**: Downloads all unique documents found, up to 500 files

## Permissions

- `activeTab`: To scan the current page
- `downloads`: To download files
- `scripting`: To inject content scripts for scanning linked pages
- `<all_urls>`: To scan linked pages on any domain (though it stays within the same domain)

## Troubleshooting

- **"Cannot scan this page"**: The extension cannot scan Chrome internal pages (chrome://, about:, etc.)
- **Downloads not appearing**: Check your Chrome downloads folder for a `downloaded-documents` subfolder
- **Missing files**: Some documents may be behind authentication or dynamically loaded

## License

MIT License

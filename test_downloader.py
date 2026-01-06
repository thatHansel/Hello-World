import unittest
from unittest.mock import patch, MagicMock
import os
import shutil
import downloader

class TestDownloader(unittest.TestCase):
    def setUp(self):
        self.test_dir = "test_downloads"
        if not os.path.exists(self.test_dir):
            os.mkdir(self.test_dir)

    def tearDown(self):
        if os.path.exists(self.test_dir):
            shutil.rmtree(self.test_dir)

    @patch('downloader.requests.get')
    def test_download_files(self, mock_get):
        # Mock the main page response
        mock_page_response = MagicMock()
        mock_page_response.content = b'''
            <html>
                <body>
                    <a href="file1.txt">File 1</a>
                    <a href="http://example.com/file2.jpg">File 2</a>
                </body>
            </html>
        '''
        mock_page_response.headers = {}
        
        # Mock the file responses
        mock_file1_response = MagicMock()
        mock_file1_response.headers = {}
        mock_file1_response.iter_content.return_value = [b"content1"]
        mock_file1_response.__enter__.return_value = mock_file1_response
        
        mock_file2_response = MagicMock()
        mock_file2_response.headers = {}
        mock_file2_response.iter_content.return_value = [b"content2"]
        mock_file2_response.__enter__.return_value = mock_file2_response

        # Configure side_effect to return different responses based on URL
        def side_effect(url, **kwargs):
            if url == "http://test.com/":
                return mock_page_response
            elif url == "http://test.com/file1.txt":
                return mock_file1_response
            elif url == "http://example.com/file2.jpg":
                return mock_file2_response
            else:
                return MagicMock()

        mock_get.side_effect = side_effect

        # Run the downloader logic (extracting parts of main or running modified main)
        # To make it testable without modifying downloader.py too much, we can import functions.
        # But downloader.py has logic in main(). I should refactor downloader.py to be more testable 
        # or just invoke the functions I exposed.
        
        # Let's verify the helpers first
        self.assertTrue(downloader.is_valid_url("http://google.com"))
        
        # Test extraction logic manually using the mocked response
        soup = downloader.BeautifulSoup(mock_page_response.content, "html.parser")
        links = set()
        target_url = "http://test.com/"
        for tag in soup.find_all('a', href=True):
            href = tag['href']
            full_url = downloader.urljoin(target_url, href)
            links.add(full_url)
        
        self.assertIn("http://test.com/file1.txt", links)
        self.assertIn("http://example.com/file2.jpg", links)
        
        # Test download_file function
        downloader.download_file("http://test.com/file1.txt", self.test_dir)
        self.assertTrue(os.path.exists(os.path.join(self.test_dir, "file1.txt")))
        with open(os.path.join(self.test_dir, "file1.txt"), 'rb') as f:
            self.assertEqual(f.read(), b"content1")

        downloader.download_file("http://example.com/file2.jpg", self.test_dir)
        self.assertTrue(os.path.exists(os.path.join(self.test_dir, "file2.jpg")))

if __name__ == '__main__':
    unittest.main()

import urllib.request

def test_source_unsplash():
    url = "https://source.unsplash.com/featured/1200x600/?minecraft"
    req = urllib.request.Request(url, headers={
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    })
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            print("Status:", res.status)
            print("Redirect URL:", res.url)
    except Exception as e:
        print("Error:", e)

test_source_unsplash()

import urllib.request
import urllib.parse
import json
import re

def test_ddg(query):
    try:
        # Step 1: DuckDuckGo token request
        url = f"https://duckduckgo.com/?q={urllib.parse.quote(query)}"
        req = urllib.request.Request(url, headers={
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        })
        with urllib.request.urlopen(req, timeout=10) as res:
            html = res.read().decode('utf-8')
            # Extract token vqd from html
            vqd_match = re.search(r"vqd=([0-9\-]+)&", html)
            if not vqd_match:
                vqd_match = re.search(r"vqd='([0-9\-]+)'", html)
            if not vqd_match:
                vqd_match = re.search(r'vqd="([0-9\-]+)"', html)
            if not vqd_match:
                print("Failed to find vqd token in HTML")
                return None
            vqd = vqd_match.group(1)
            print(f"Found vqd token: {vqd}")
            
            # Step 2: Request images
            image_url = f"https://duckduckgo.com/i.js?l=us-en&o=json&q={urllib.parse.quote(query)}&vqd={vqd}&f=,,,&p=1"
            req2 = urllib.request.Request(image_url, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Referer': 'https://duckduckgo.com/'
            })
            with urllib.request.urlopen(req2, timeout=10) as res2:
                data = json.loads(res2.read().decode('utf-8'))
                results = data.get('results', [])
                print(f"Got {len(results)} image results")
                for r in results[:3]:
                    print(f"Title: {r.get('title')}\nURL: {r.get('image')}\n")
                if results:
                    return results[0].get('image')
    except Exception as e:
        print(f"Error: {e}")
    return None

test_ddg("Minecraft")
test_ddg("The Last of Us Part I")
test_ddg("Artificial Intelligence")

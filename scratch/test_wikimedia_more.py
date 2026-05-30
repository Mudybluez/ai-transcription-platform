import urllib.request
import urllib.parse
import json

def test_wikimedia(query):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrsearch={urllib.parse.quote(query)}&gsrnamespace=6&prop=imageinfo&iiprop=url|size|mime&format=json&origin=*&gsrlimit=20"
    print(f"\nQuery: {query}")
    
    req = urllib.request.Request(url, headers={
        'User-Agent': 'ZenScribe/1.0 (test)'
    })
    
    try:
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode('utf-8'))
        
        pages = list(data.get('query', {}).get('pages', {}).values())
        
        images = []
        for p in pages:
            info = (p.get('imageinfo') or [{}])[0]
            mime = info.get('mime', '')
            w = info.get('width', 0) or 0
            h = info.get('height', 0) or 0
            if mime in ('image/jpeg','image/png','image/webp') and w >= 500 and (h == 0 or w/h >= 0.7):
                images.append(info.get('url',''))
        
        print(f"After filter: {len(images)} images pass")
        if images:
            for idx, img in enumerate(images[:3]):
                print(f"  {idx+1}: {img}")
        return images
    except Exception as e:
        print(f"Error: {e}")

test_wikimedia("Geometry Analysis")
test_wikimedia("Software Architecture")
test_wikimedia("Dota 2")
test_wikimedia("Counter-Strike")

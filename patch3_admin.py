#!/usr/bin/env python3
"""Part 3: Create admin-photos.html and add link from admin.html."""
import os

# Create admin photo management page
admin_html = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>NorthBound Admin - Photos</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a1a;color:#fff;font-family:-apple-system,sans-serif;padding:20px}
h1{color:#d4a853;margin-bottom:20px}
.upload-area{border:2px dashed #333;border-radius:12px;padding:30px;text-align:center;margin-bottom:20px;cursor:pointer;transition:border-color 0.3s}
.upload-area:hover,.upload-area.dragover{border-color:#d4a853}
.upload-area input{display:none}
.upload-area p{color:#999}
.btn{background:#d4a853;color:#000;border:none;padding:10px 20px;border-radius:6px;cursor:pointer;font-weight:bold}
.btn:hover{background:#c49843}
.btn-danger{background:#e74c3c;color:#fff;padding:6px 12px;font-size:0.85rem}
.photo-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:15px;margin-top:20px}
.photo-card{background:#1a1a2e;border-radius:8px;overflow:hidden}
.photo-card img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block}
.photo-card .info{padding:10px}
.photo-card input{width:100%;background:#111;border:1px solid #333;color:#fff;padding:6px 8px;border-radius:4px;margin-bottom:6px;font-size:0.85rem}
.photo-card .actions{display:flex;gap:6px}
.back-link{color:#d4a853;text-decoration:none;display:inline-block;margin-bottom:15px}
.status{padding:10px;margin:10px 0;border-radius:6px;display:none}
.status.success{background:#2ecc71;color:#000;display:block}
.status.error{background:#e74c3c;color:#fff;display:block}
.sort-input{width:50px!important;display:inline-block!important}
</style>
</head>
<body>
<a href="/admin" class="back-link">&larr; Back to Admin</a>
<h1>Nightlife Photos</h1>
<div class="upload-area" id="dropZone" onclick="document.getElementById('fileInput').click()">
  <input type="file" id="fileInput" accept="image/*" multiple>
  <p><strong>Click or drag photos here to upload</strong></p>
  <p style="margin-top:8px;font-size:0.85rem;">JPG, PNG, WebP - Max 10MB each</p>
</div>
<div id="status" class="status"></div>
<h2 style="margin-top:20px;color:#d4a853;">Current Photos</h2>
<div id="photoGrid" class="photo-grid"></div>
<script>
var dz=document.getElementById('dropZone'),fi=document.getElementById('fileInput'),st=document.getElementById('status');
dz.addEventListener('dragover',function(e){e.preventDefault();dz.classList.add('dragover')});
dz.addEventListener('dragleave',function(){dz.classList.remove('dragover')});
dz.addEventListener('drop',function(e){e.preventDefault();dz.classList.remove('dragover');handleFiles(e.dataTransfer.files)});
fi.addEventListener('change',function(){handleFiles(fi.files)});
function handleFiles(files){
  var rem=files.length;st.className='status success';st.textContent='Uploading '+rem+' photo(s)...';
  Array.from(files).forEach(function(file){
    var fd=new FormData();fd.append('photo',file);fd.append('caption','');fd.append('sort_order','0');
    fetch('/api/admin/nightlife-photos',{method:'POST',body:fd})
      .then(function(r){return r.json()}).then(function(){
        rem--;if(rem<=0){st.textContent='All photos uploaded!';loadPhotos();setTimeout(function(){st.className='status'},3000)}
      }).catch(function(e){st.className='status error';st.textContent='Upload failed: '+e.message});
  });
}
function loadPhotos(){
  fetch('/api/nightlife-photos').then(function(r){return r.json()}).then(function(d){
    var g=document.getElementById('photoGrid');
    if(!d.photos||d.photos.length===0){g.innerHTML='<p style="color:#666;grid-column:1/-1">No photos yet. Upload some above!</p>';return}
    g.innerHTML=d.photos.map(function(p){
      return '<div class="photo-card" data-id="'+p.id+'"><img src="/api/nightlife-photos/'+p.id+'/image" alt="'+(p.caption||'')+'"><div class="info"><input type="text" value="'+(p.caption||'')+'" placeholder="Caption" onchange="updatePhoto('+p.id+',this.value,this.parentElement.querySelector(\'.sort-input\').value)"><div class="actions"><input type="number" class="sort-input" value="'+(p.sort_order||0)+'" title="Sort order" onchange="updatePhoto('+p.id+',this.parentElement.parentElement.querySelector(\'input[type=text]\').value,this.value)"><button class="btn btn-danger" onclick="deletePhoto('+p.id+')">Delete</button></div></div></div>'
    }).join('');
  });
}
function deletePhoto(id){if(!confirm('Delete this photo?'))return;fetch('/api/admin/nightlife-photos/'+id,{method:'DELETE'}).then(function(){loadPhotos()})}
function updatePhoto(id,cap,so){fetch('/api/admin/nightlife-photos/'+id,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({caption:cap,sort_order:parseInt(so)||0})})}
loadPhotos();
</script>
</body>
</html>'''

admin_path = os.path.expanduser('~/temp-deploy/public/admin-photos.html')
with open(admin_path, 'w') as f:
    f.write(admin_html)
print('[1] Created admin-photos.html')

# Add link from admin.html
admin_index = os.path.expanduser('~/temp-deploy/public/admin.html')
if os.path.exists(admin_index):
    with open(admin_index) as f:
        ah = f.read()
    if 'admin-photos' not in ah:
        link = '\n<div style="margin:20px 0;padding:15px;background:#1a1a2e;border-radius:8px;"><a href="/admin-photos.html" style="color:#d4a853;font-size:1.1rem;text-decoration:none;font-weight:bold;">Manage Nightlife Photos</a><p style="color:#999;font-size:0.85rem;margin-top:4px;">Upload, reorder, and manage carousel photos</p></div>\n'
        be = ah.rfind('</body>')
        if be != -1:
            ah = ah[:be] + link + ah[be:]
        else:
            ah += link
        with open(admin_index, 'w') as f:
            f.write(ah)
        print('[2] Added photo link to admin.html')
else:
    print('[2] No admin.html found')

print('DONE Part 3 complete')

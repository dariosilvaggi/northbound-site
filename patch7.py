#!/usr/bin/env python3
"""Patch: Insert photo management into admin/dashboard.html panel-clubs."""
import os

path = os.path.expanduser('~/temp-deploy/admin/dashboard.html')
with open(path) as f:
    s = f.read()

if 'photoDropZone' in s:
    print('Already patched - skipping')
    exit(0)

# The exact marker: clubs panel closing </div> followed by ITINERARY comment
marker = '    </div>\n\n    <!-- ITINERARY -->'
pos = s.find(marker)
if pos == -1:
    print('ERROR: Cannot find clubs/itinerary boundary marker')
    exit(1)

photo_section = """
      <!-- Nightlife Photos Section -->
      <div style="margin-top:40px;padding-top:30px;border-top:1px solid rgba(200,151,78,0.15);">
        <div class="panel-title" style="font-size:1.3rem;">Carousel Photos</div>
        <p class="panel-sub">Upload photos for the homepage nightlife carousel.</p>
        <div class="card" style="margin-top:16px;">
          <div style="font-weight:700;color:#d4a853;text-transform:uppercase;font-size:.75rem;letter-spacing:.08em;margin-bottom:12px;">Upload Photos</div>
          <div id="photoDropZone" style="border:2px dashed rgba(200,151,78,0.3);border-radius:10px;padding:30px;text-align:center;cursor:pointer;transition:border-color 0.3s;">
            <input type="file" id="photoFileInput" accept="image/*" multiple style="display:none">
            <p style="color:#d4a853;font-weight:600;">Click or drag photos here</p>
            <p style="color:#666;font-size:.85rem;margin-top:6px;">JPG, PNG, WebP &mdash; Max 10MB each</p>
          </div>
          <div id="photoStatus" style="display:none;padding:10px;margin-top:10px;border-radius:6px;font-size:.9rem;"></div>
        </div>
        <div class="section-bar" style="margin-top:20px;">
          <span>All Photos</span><span class="count-badge" id="photoCount">0</span>
        </div>
        <div id="photoGrid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-top:12px;"></div>
      </div>
"""

# Insert photo section BEFORE the closing </div> of panel-clubs
s = s[:pos] + photo_section + s[pos:]
print('[1] Inserted photo HTML into panel-clubs')

# Add JS before last </script>
if 'loadAdminPhotos' not in s:
    script_end = s.rfind('</script>')
    photo_js = """

// === Nightlife Photo Management ===
(function(){
  var dz=document.getElementById('photoDropZone');
  var fi=document.getElementById('photoFileInput');
  var st=document.getElementById('photoStatus');
  var grid=document.getElementById('photoGrid');
  var cnt=document.getElementById('photoCount');
  if(!dz)return;

  dz.addEventListener('click',function(){fi.click();});
  dz.addEventListener('dragover',function(e){e.preventDefault();dz.style.borderColor='#d4a853';});
  dz.addEventListener('dragleave',function(){dz.style.borderColor='rgba(200,151,78,0.3)';});
  dz.addEventListener('drop',function(e){e.preventDefault();dz.style.borderColor='rgba(200,151,78,0.3)';handlePhotoFiles(e.dataTransfer.files);});
  fi.addEventListener('change',function(){handlePhotoFiles(fi.files);fi.value='';});

  function handlePhotoFiles(files){
    var rem=files.length;
    st.style.display='block';
    st.style.background='rgba(212,168,83,0.15)';
    st.style.color='#d4a853';
    st.textContent='Uploading '+rem+' photo(s)...';
    Array.from(files).forEach(function(file){
      var fd=new FormData();
      fd.append('photo',file);
      fd.append('caption','');
      fd.append('sort_order','0');
      fetch('/api/admin/nightlife-photos',{method:'POST',body:fd})
        .then(function(r){return r.json();})
        .then(function(d){
          if(d.error){
            st.style.background='rgba(231,76,60,0.15)';
            st.style.color='#e74c3c';
            st.textContent='Error: '+d.error;
            return;
          }
          rem--;
          if(rem<=0){
            st.textContent='All photos uploaded!';
            loadAdminPhotos();
            setTimeout(function(){st.style.display='none';},3000);
          }
        })
        .catch(function(e){
          st.style.background='rgba(231,76,60,0.15)';
          st.style.color='#e74c3c';
          st.textContent='Upload failed: '+e.message;
        });
    });
  }

  window.loadAdminPhotos=function(){
    fetch('/api/nightlife-photos')
      .then(function(r){return r.json();})
      .then(function(d){
        if(!d.photos){
          grid.innerHTML='<p style="color:#555;grid-column:1/-1;text-align:center;padding:20px;">Could not load photos.</p>';
          cnt.textContent='0';
          return;
        }
        cnt.textContent=d.photos.length;
        if(d.photos.length===0){
          grid.innerHTML='<p style="color:#555;grid-column:1/-1;text-align:center;padding:20px;">No photos yet. Upload some above!</p>';
          return;
        }
        var html='';
        d.photos.forEach(function(p){
          html+='<div style="background:#111118;border:1px solid rgba(200,151,78,0.1);border-radius:10px;overflow:hidden;" data-photo-id="'+p.id+'">';
          html+='<img src="/api/nightlife-photos/'+p.id+'/image" style="width:100%;aspect-ratio:16/9;object-fit:cover;display:block;">';
          html+='<div style="padding:10px;">';
          html+='<input type="text" class="photo-caption" value="'+(p.caption||'')+'" placeholder="Caption" style="width:100%;background:#0a0a14;border:1px solid #333;color:#fff;padding:6px 8px;border-radius:4px;margin-bottom:6px;font-size:.85rem;">';
          html+='<div style="display:flex;gap:6px;align-items:center;">';
          html+='<input type="number" class="photo-sort" value="'+(p.sort_order||0)+'" title="Sort order" style="width:50px;background:#0a0a14;border:1px solid #333;color:#fff;padding:6px;border-radius:4px;font-size:.85rem;">';
          html+='<button class="photo-delete" style="background:#e74c3c;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:.8rem;margin-left:auto;">Delete</button>';
          html+='</div></div></div>';
        });
        grid.innerHTML=html;
      })
      .catch(function(){
        grid.innerHTML='<p style="color:#555;grid-column:1/-1;text-align:center;padding:20px;">Failed to load photos.</p>';
      });
  };

  grid.addEventListener('click',function(e){
    if(e.target.classList.contains('photo-delete')){
      var card=e.target.closest('[data-photo-id]');
      if(!card)return;
      var id=card.getAttribute('data-photo-id');
      if(!confirm('Delete this photo?'))return;
      fetch('/api/admin/nightlife-photos/'+id,{method:'DELETE'})
        .then(function(){loadAdminPhotos();});
    }
  });
  grid.addEventListener('change',function(e){
    if(e.target.classList.contains('photo-caption')||e.target.classList.contains('photo-sort')){
      var card=e.target.closest('[data-photo-id]');
      if(!card)return;
      var id=card.getAttribute('data-photo-id');
      var cap=card.querySelector('.photo-caption').value;
      var so=card.querySelector('.photo-sort').value;
      fetch('/api/admin/nightlife-photos/'+id,{
        method:'PUT',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({caption:cap,sort_order:parseInt(so)||0})
      });
    }
  });

  loadAdminPhotos();
})();
"""
    s = s[:script_end] + photo_js + s[script_end:]
    print('[2] Added photo management JS')

with open(path, 'w') as f:
    f.write(s)
print('DONE - changes applied to admin/dashboard.html')

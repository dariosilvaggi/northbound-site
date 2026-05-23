#!/usr/bin/env python3
"""Part 1: Add carousel HTML, CSS, and JS to index.html."""
import os, re

path = os.path.expanduser('~/temp-deploy/public/index.html')
with open(path) as f:
    html = f.read()

changes = 0

# 1. Insert carousel HTML between buttons
carousel_html = '''
    <!-- Nightlife Photo Carousel -->
    <div class="nightlife-carousel-wrapper" id="nightlifeCarousel">
      <div class="nightlife-carousel" id="carouselTrack"></div>
      <div class="carousel-dots" id="carouselDots"></div>
    </div>
'''

book_btn = re.search(r'(Book Your Weekend Here\s*→?\s*</a>)', html)
how_btn = re.search(r'(<a[^>]*>How It Works</a>)', html)

if book_btn and how_btn and book_btn.end() < how_btn.start():
    html = html[:book_btn.end()] + carousel_html + html[book_btn.end():]
    changes += 1
    print('[1] Inserted carousel HTML')
elif how_btn:
    html = html[:how_btn.start()] + carousel_html + html[how_btn.start():]
    changes += 1
    print('[1] Inserted carousel HTML (fallback)')
else:
    print('[1] SKIP - buttons not found')

# 2. Add carousel CSS before </style>
carousel_css = '''
/* Nightlife Carousel */
.nightlife-carousel-wrapper{width:100%;max-width:700px;margin:2rem auto;position:relative;overflow:hidden;border-radius:12px;}
.nightlife-carousel{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scroll-behavior:smooth;-webkit-overflow-scrolling:touch;scrollbar-width:none;-ms-overflow-style:none;gap:0;}
.nightlife-carousel::-webkit-scrollbar{display:none;}
.nightlife-carousel .carousel-slide{flex:0 0 100%;scroll-snap-align:start;position:relative;aspect-ratio:16/9;overflow:hidden;}
.nightlife-carousel .carousel-slide img{width:100%;height:100%;object-fit:cover;display:block;}
.carousel-dots{display:flex;justify-content:center;gap:8px;padding:12px 0 4px;}
.carousel-dots .dot{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.3);cursor:pointer;transition:background 0.3s,transform 0.3s;}
.carousel-dots .dot.active{background:#d4a853;transform:scale(1.3);}
@media(max-width:768px){.nightlife-carousel-wrapper{max-width:100%;margin:1.5rem auto;border-radius:8px;}.nightlife-carousel .carousel-slide{aspect-ratio:4/3;}}
'''

style_end = html.rfind('</style>')
if style_end != -1:
    html = html[:style_end] + carousel_css + html[style_end:]
    changes += 1
    print('[2] Added carousel CSS')

# 3. Add carousel JS before </body>
carousel_js = '''<script>
(function(){
  var track=document.getElementById('carouselTrack'),dots=document.getElementById('carouselDots'),wrapper=document.getElementById('nightlifeCarousel');
  if(!track)return;
  var autoInt=null,cur=0,total=0;
  function load(){
    fetch('/api/nightlife-photos').then(function(r){return r.json()}).then(function(d){
      if(!d.photos||d.photos.length===0){wrapper.style.display='none';return;}
      wrapper.style.display='block';total=d.photos.length;track.innerHTML='';dots.innerHTML='';
      d.photos.forEach(function(p,i){
        var s=document.createElement('div');s.className='carousel-slide';
        var img=document.createElement('img');img.src='/api/nightlife-photos/'+p.id+'/image';img.alt=p.caption||'Windsor nightlife';img.loading=i<2?'eager':'lazy';
        s.appendChild(img);track.appendChild(s);
        var dot=document.createElement('span');dot.className='dot'+(i===0?' active':'');
        dot.addEventListener('click',function(){go(i)});dots.appendChild(dot);
      });
      startA();track.addEventListener('scroll',onScroll);
    }).catch(function(){wrapper.style.display='none'});
  }
  function go(n){cur=n;var w=track.querySelector('.carousel-slide').offsetWidth;track.scrollTo({left:w*n,behavior:'smooth'});upDots();}
  function upDots(){dots.querySelectorAll('.dot').forEach(function(d,i){d.className=i===cur?'dot active':'dot'});}
  function onScroll(){var w=track.querySelector('.carousel-slide').offsetWidth;var ns=Math.round(track.scrollLeft/w);if(ns!==cur){cur=ns;upDots();}}
  function next(){cur=(cur+1)%total;go(cur);}
  function startA(){stopA();autoInt=setInterval(next,4000);}
  function stopA(){if(autoInt)clearInterval(autoInt);}
  track.addEventListener('touchstart',stopA);track.addEventListener('mousedown',stopA);
  track.addEventListener('touchend',function(){setTimeout(startA,5000)});
  track.addEventListener('mouseup',function(){setTimeout(startA,5000)});
  load();
})();
</script>
'''

body_end = html.rfind('</body>')
if body_end != -1:
    html = html[:body_end] + carousel_js + html[body_end:]
    changes += 1
    print('[3] Added carousel JS')

with open(path, 'w') as f:
    f.write(html)
print(f'DONE Part 1 - {changes} changes')

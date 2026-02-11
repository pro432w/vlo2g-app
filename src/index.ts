import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
  ADMIN_EMAIL: string
  ADMIN_PASS: string
}

const app = new Hono<{ Bindings: Bindings }>()

// --- SVG ICONS (NO EMOJI) ---
const ICONS = {
  bell: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>`,
  pencil: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  menu: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>`,
  trash: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>`,
  eye: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  check: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  x: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 18 12"/></svg>`,
  logout: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
  back: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>`
}

// --- DATABASE SETUP ROUTE (Run once: /setup) ---
app.get('/setup', async (c) => {
  await c.env.DB.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      content TEXT,
      image TEXT,
      is_html BOOLEAN,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT DEFAULT 'active',
      views INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER,
      parent_id INTEGER,
      author TEXT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS announcements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS visitors (
      id INTEGER PRIMARY KEY,
      count INTEGER DEFAULT 0
    );
    INSERT OR IGNORE INTO visitors (id, count) VALUES (1, 0);
  `)
  return c.text('Database initialized.')
})

// --- MIDDLEWARE ---
const adminAuth = async (c: any, next: any) => {
  const session = getCookie(c, 'admin_session')
  if (session !== 'valid') return c.redirect('/admin/login')
  await next()
}

// --- HELPER: HTML LAYOUT ---
const Layout = (content: string, title: string = 'Vlog App', modal: string = '') => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: sans-serif; background: #f3f4f6; color: #1f2937; }
    .prose img { border-radius: 0.5rem; margin: 1rem 0; }
    .toggle-checkbox:checked { right: 0; border-color: #3b82f6; }
    .toggle-checkbox:checked + .toggle-label { background-color: #3b82f6; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  ${content}
  ${modal}
  <script>
    function toggleModal(id) {
      const el = document.getElementById(id);
      if(el) el.classList.toggle('hidden');
    }
  </script>
</body>
</html>
`
// --- PUBLIC ROUTES ---

// 1. User Home
app.get('/', async (c) => {
  // Increment visitor
  await c.env.DB.prepare('UPDATE visitors SET count = count + 1 WHERE id = 1').run()
  
  const posts = await c.env.DB.prepare("SELECT * FROM posts WHERE status = 'active' ORDER BY created_at DESC").all()
  const announcements = await c.env.DB.prepare("SELECT * FROM announcements ORDER BY created_at DESC LIMIT 5").all()
  
  // Announcement Modal
  const modalHtml = `
    <div id="announce-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden flex items-center justify-center z-50">
      <div class="bg-white p-6 rounded-lg max-w-md w-full m-4 shadow-xl">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-bold">Announcements</h3>
          <button onclick="toggleModal('announce-modal')" class="text-gray-500 hover:text-red-500">${ICONS.x}</button>
        </div>
        <div class="space-y-4 max-h-60 overflow-y-auto">
          ${announcements.results.length ? announcements.results.map((a:any) => `
            <div class="border-b pb-2">
              <p>${a.content}</p>
              <small class="text-gray-400 text-xs">${new Date(a.created_at).toLocaleDateString()}</small>
            </div>
          `).join('') : '<p class="text-gray-500">No new announcements.</p>'}
        </div>
      </div>
    </div>
  `

  const html = `
    <header class="bg-white shadow sticky top-0 z-40">
      <div class="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <button onclick="toggleModal('announce-modal')" class="text-gray-600 hover:text-blue-600 transition">
          ${ICONS.bell}
        </button>
        <h1 class="text-xl font-bold tracking-tight">Vlog Space</h1>
        <div class="w-6"></div> 
      </div>
    </header>

    <main class="flex-1 max-w-5xl mx-auto px-4 py-8 w-full">
      <div class="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        ${posts.results.map((post: any) => `
          <a href="/post/${post.id}" target="_blank" class="block group">
            <article class="bg-white rounded-xl shadow-sm hover:shadow-md transition overflow-hidden h-full flex flex-col border border-gray-100">
              <div class="h-48 bg-gray-200 overflow-hidden">
                ${post.image ? `<img src="${post.image}" alt="${post.title}" class="w-full h-full object-cover group-hover:scale-105 transition duration-500">` : `<div class="w-full h-full flex items-center justify-center text-gray-400">No Image</div>`}
              </div>
              <div class="p-5 flex-1 flex flex-col">
                <h2 class="text-lg font-bold mb-2 group-hover:text-blue-600 transition">${post.title}</h2>
                <div class="mt-auto flex justify-between items-center text-xs text-gray-400">
                  <span>${new Date(post.created_at).toLocaleDateString()}</span>
                  <div class="flex items-center gap-1">${ICONS.eye} ${post.views}</div>
                </div>
              </div>
            </article>
          </a>
        `).join('')}
      </div>
    </main>
    <footer class="bg-white border-t py-6 text-center text-gray-500 text-sm">
      &copy; ${new Date().getFullYear()} Vlog Space
    </footer>
  `
  return c.html(Layout(html, 'Home', modalHtml))
})

// 2. Read Post (User)
app.get('/post/:id', async (c) => {
  const id = c.req.param('id')
  
  // Update views
  await c.env.DB.prepare('UPDATE posts SET views = views + 1 WHERE id = ?').bind(id).run()
  
  const post: any = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first()
  if (!post) return c.notFound()

  const comments = await c.env.DB.prepare('SELECT * FROM comments WHERE post_id = ? ORDER BY created_at ASC').bind(id).all()
  
  const renderComments = (parentId: number | null = null, depth = 0) => {
    return comments.results
      .filter((cm: any) => cm.parent_id === parentId)
      .map((cm: any) => `
        <div class="mb-3 ${depth > 0 ? 'ml-8 pl-4 border-l-2 border-gray-200' : ''}">
          <div class="bg-gray-50 p-3 rounded-lg">
            <div class="flex justify-between items-start mb-1">
              <span class="font-bold text-sm">${cm.author}</span>
              <span class="text-xs text-gray-400">${new Date(cm.created_at).toLocaleString()}</span>
            </div>
            <p class="text-gray-700 text-sm">${cm.content}</p>
            <button onclick="document.getElementById('reply-${cm.id}').classList.toggle('hidden')" class="text-blue-600 text-xs mt-2 font-medium hover:underline">Reply</button>
          </div>
          <form action="/api/reply/${id}/${cm.id}" method="POST" id="reply-${cm.id}" class="hidden mt-2 ml-2">
             <input type="text" name="author" placeholder="Name" required class="block w-full text-sm border-gray-300 rounded mb-1 p-2 border">
             <input type="text" name="content" placeholder="Write a reply..." required class="block w-full text-sm border-gray-300 rounded mb-1 p-2 border">
             <button type="submit" class="bg-gray-800 text-white text-xs px-3 py-1 rounded">Post Reply</button>
          </form>
          ${renderComments(cm.id, depth + 1)}
        </div>
      `).join('')
  }

  const html = `
    <div class="max-w-3xl mx-auto px-4 py-10">
      <h1 class="text-3xl md:text-4xl font-extrabold mb-4 text-gray-900">${post.title}</h1>
      <div class="text-gray-500 text-sm mb-6 flex gap-4">
        <span>${new Date(post.created_at).toLocaleDateString()}</span>
        <span class="flex items-center gap-1">${ICONS.eye} ${post.views} Views</span>
      </div>
      
      ${post.image ? `<img src="${post.image}" class="w-full rounded-xl shadow mb-8">` : ''}

      <div class="prose prose-lg max-w-none text-gray-700 leading-relaxed mb-12">
        ${post.is_html ? post.content : `<p>${post.content.replace(/\n/g, '<br>')}</p>`}
      </div>

      <hr class="border-gray-200 my-8">

      <section>
        <h3 class="text-xl font-bold mb-6">Comments</h3>
        
        <form action="/api/comment/${id}" method="POST" class="bg-white p-4 rounded-lg shadow-sm border border-gray-200 mb-8">
          <div class="grid grid-cols-1 gap-3">
            <input type="text" name="author" placeholder="Your Name" required class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none transition">
            <textarea name="content" rows="3" placeholder="Write a comment..." required class="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 outline-none transition"></textarea>
            <div class="text-right">
              <button class="bg-blue-600 text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition">Post</button>
            </div>
          </div>
        </form>

        <div class="space-y-4">
          ${renderComments(null)}
        </div>
      </section>
    </div>
  `
  return c.html(Layout(html, post.title))
})

// 3. API Handlers
app.post('/api/comment/:pid', async (c) => {
  const pid = c.req.param('pid')
  const body = await c.req.parseBody()
  await c.env.DB.prepare('INSERT INTO comments (post_id, parent_id, author, content) VALUES (?, NULL, ?, ?)').bind(pid, body.author, body.content).run()
  return c.redirect(`/post/${pid}`)
})

app.post('/api/reply/:pid/:cid', async (c) => {
  const pid = c.req.param('pid')
  const cid = c.req.param('cid')
  const body = await c.req.parseBody()
  await c.env.DB.prepare('INSERT INTO comments (post_id, parent_id, author, content) VALUES (?, ?, ?, ?)').bind(pid, cid, body.author, body.content).run()
  return c.redirect(`/post/${pid}`)
})
// --- ADMIN ROUTES ---

// 1. Login
app.get('/admin/login', (c) => {
  const html = `
    <div class="flex items-center justify-center min-h-screen bg-gray-100">
      <div class="bg-white p-8 rounded-xl shadow-lg w-full max-w-sm">
        <h2 class="text-2xl font-bold mb-6 text-center">Admin Login</h2>
        <form method="POST">
          <div class="mb-4">
            <label class="block text-gray-700 text-sm font-bold mb-2">Email</label>
            <input type="email" name="email" class="w-full p-3 border rounded-lg" required>
          </div>
          <div class="mb-6">
            <label class="block text-gray-700 text-sm font-bold mb-2">Password</label>
            <input type="password" name="password" class="w-full p-3 border rounded-lg" required>
          </div>
          <button class="w-full bg-blue-600 text-white p-3 rounded-lg font-bold hover:bg-blue-700">Login</button>
        </form>
      </div>
    </div>
  `
  return c.html(Layout(html))
})

app.post('/admin/login', async (c) => {
  const body = await c.req.parseBody()
  if (body.email === c.env.ADMIN_EMAIL && body.password === c.env.ADMIN_PASS) {
    setCookie(c, 'admin_session', 'valid', { path: '/', httpOnly: true, secure: true })
    return c.redirect('/admin/dashboard')
  }
  return c.html(Layout('<p class="text-center mt-10 text-red-500">Invalid Credentials</p>'))
})

app.get('/logout', (c) => {
  deleteCookie(c, 'admin_session')
  return c.redirect('/admin/login')
})

// 2. Admin Dashboard
app.get('/admin/dashboard', adminAuth, async (c) => {
  const posts = await c.env.DB.prepare(`
    SELECT p.*, COUNT(c.id) as comment_count 
    FROM posts p 
    LEFT JOIN comments c ON p.id = c.post_id 
    WHERE p.status = 'active' 
    GROUP BY p.id 
    ORDER BY p.created_at DESC
  `).all()

  const drawerScript = `
    <script>
      function toggleDrawer() {
        const d = document.getElementById('drawer');
        const o = document.getElementById('overlay');
        if(d.classList.contains('-translate-x-full')) {
          d.classList.remove('-translate-x-full');
          o.classList.remove('hidden');
        } else {
          d.classList.add('-translate-x-full');
          o.classList.add('hidden');
        }
      }
    </script>
  `

  const html = `
    <div id="overlay" onclick="toggleDrawer()" class="fixed inset-0 bg-black bg-opacity-50 z-40 hidden transition-opacity"></div>
    
    <aside id="drawer" class="fixed top-0 left-0 z-50 w-64 h-screen transition-transform -translate-x-full bg-white border-r">
      <div class="h-full px-3 py-4 overflow-y-auto">
         <div class="flex items-center justify-between mb-8 px-2">
            <span class="text-xl font-bold text-gray-800">Menu</span>
            <button onclick="toggleDrawer()">${ICONS.x}</button>
         </div>
         <ul class="space-y-2 font-medium">
            <li>
               <a href="/admin/stats" class="flex items-center p-2 text-gray-900 rounded-lg hover:bg-gray-100 group">
                  <span class="flex-1 ms-3 whitespace-nowrap">Visitors</span>
               </a>
            </li>
            <li>
               <a href="/admin/announcements" class="flex items-center p-2 text-gray-900 rounded-lg hover:bg-gray-100 group">
                  <span class="flex-1 ms-3 whitespace-nowrap">Announcements</span>
               </a>
            </li>
            <li>
               <a href="/admin/trash" class="flex items-center p-2 text-gray-900 rounded-lg hover:bg-gray-100 group">
                  <span class="flex-1 ms-3 whitespace-nowrap">Trash Can</span>
               </a>
            </li>
            <li class="border-t pt-2 mt-2">
               <a href="/logout" class="flex items-center p-2 text-red-600 rounded-lg hover:bg-red-50 group">
                  <span class="flex-1 ms-3 whitespace-nowrap">Logout</span>
                  ${ICONS.logout}
               </a>
            </li>
         </ul>
      </div>
    </aside>

    <nav class="bg-white border-b px-4 py-2.5 flex justify-between items-center sticky top-0 z-30">
       <button onclick="toggleDrawer()" class="p-2 text-gray-600 rounded-lg hover:bg-gray-100 focus:ring-2 focus:ring-gray-200">
          ${ICONS.menu}
       </button>
       <span class="font-bold text-lg">Dashboard</span>
       <a href="/admin/editor" class="p-2 text-blue-600 hover:bg-blue-50 rounded-full transition">
          ${ICONS.pencil}
       </a>
    </nav>

    <div class="p-4 max-w-4xl mx-auto">
      <div class="bg-white shadow rounded-lg overflow-hidden">
        <ul class="divide-y divide-gray-200">
          ${posts.results.map((p: any) => `
            <li class="p-4 hover:bg-gray-50 flex items-center justify-between">
              <div class="flex-1 min-w-0 pr-4">
                <p class="text-sm font-medium text-gray-900 truncate">${p.title}</p>
                <div class="text-xs text-gray-500 mt-1 flex gap-3">
                   <span>${ICONS.eye} ${p.views}</span>
                   <span>Comments: ${p.comment_count}</span>
                   <span>Date: ${new Date(p.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <a href="/admin/editor?id=${p.id}" class="text-blue-600 bg-blue-100 p-2 rounded hover:bg-blue-200 transition">Edit</a>
                <form action="/admin/delete" method="POST" onsubmit="return confirm('Move to trash?')">
                  <input type="hidden" name="id" value="${p.id}">
                  <button class="text-red-600 bg-red-100 p-2 rounded hover:bg-red-200 transition">${ICONS.trash}</button>
                </form>
              </div>
            </li>
          `).join('')}
          ${posts.results.length === 0 ? '<li class="p-8 text-center text-gray-500">No active posts. Click the pencil icon to write.</li>' : ''}
        </ul>
      </div>
    </div>
    ${drawerScript}
  `
  return c.html(Layout(html))
})

// 3. Editor (Create/Edit)
app.get('/admin/editor', adminAuth, async (c) => {
  const id = c.req.query('id')
  let post: any = { title: '', content: '', image: '', is_html: 0 }
  if (id) {
    post = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first()
  }

  const html = `
    <nav class="bg-white border-b px-4 py-3 flex justify-between items-center">
       <a href="/admin/dashboard" class="text-gray-600">${ICONS.back}</a>
       <span class="font-bold">Editor</span>
       <button form="editForm" class="text-blue-600 font-bold uppercase text-sm tracking-wider">Publish</button>
    </nav>

    <div class="max-w-2xl mx-auto p-4">
      <form id="editForm" action="/admin/save" method="POST" class="space-y-4">
        <input type="hidden" name="id" value="${id || ''}">
        
        <input type="url" name="image" value="${post.image || ''}" placeholder="Cover Image URL (Optional)" class="w-full p-3 bg-white border border-gray-300 rounded-lg text-sm">

        <input type="text" name="title" value="${post.title}" placeholder="Blog Title" required class="w-full p-3 text-xl font-bold bg-transparent border-b border-gray-300 focus:border-blue-500 outline-none">
        
        <div class="flex items-center justify-between py-2 border-b border-gray-100">
           <span class="text-xs text-gray-400">${new Date().toDateString()}</span>
           <div class="relative inline-block w-10 mr-2 align-middle select-none transition duration-200 ease-in">
              <input type="checkbox" name="is_html" id="toggle" class="toggle-checkbox absolute block w-6 h-6 rounded-full bg-white border-4 appearance-none cursor-pointer border-gray-300" ${post.is_html ? 'checked' : ''}/>
              <label for="toggle" class="toggle-label block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer"></label>
           </div>
        </div>
        <p class="text-xs text-right text-gray-400">Right: HTML Mode | Left: Normal</p>

        <textarea name="content" id="contentArea" placeholder="Write your story..." class="w-full h-96 p-3 bg-transparent outline-none resize-none font-sans text-gray-800 leading-relaxed">${post.content}</textarea>
      </form>
    </div>
    
    <script>
      const toggle = document.getElementById('toggle');
      const area = document.getElementById('contentArea');
      
      function setMode() {
        if(toggle.checked) {
          area.classList.add('font-mono', 'text-sm', 'bg-gray-50');
          area.placeholder = "Paste your HTML code here...";
        } else {
          area.classList.remove('font-mono', 'text-sm', 'bg-gray-50');
          area.placeholder = "Write your story...";
        }
      }
      toggle.addEventListener('change', setMode);
      setMode();
    </script>
  `
  return c.html(Layout(html))
})

app.post('/admin/save', adminAuth, async (c) => {
  const body = await c.req.parseBody()
  const isHtml = body.is_html === 'on' ? 1 : 0
  
  if (body.id) {
    await c.env.DB.prepare('UPDATE posts SET title=?, content=?, image=?, is_html=? WHERE id=?')
      .bind(body.title, body.content, body.image, isHtml, body.id).run()
  } else {
    await c.env.DB.prepare('INSERT INTO posts (title, content, image, is_html) VALUES (?, ?, ?, ?)')
      .bind(body.title, body.content, body.image, isHtml).run()
  }
  return c.redirect('/admin/dashboard')
})

app.post('/admin/delete', adminAuth, async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare("UPDATE posts SET status = 'trash' WHERE id = ?").bind(body.id).run()
  return c.redirect('/admin/dashboard')
})

// 4. Trash Can
app.get('/admin/trash', adminAuth, async (c) => {
  const posts = await c.env.DB.prepare("SELECT * FROM posts WHERE status = 'trash' ORDER BY created_at DESC").all()
  
  const html = `
    <nav class="bg-white border-b px-4 py-3 flex items-center gap-2">
       <a href="/admin/dashboard" class="text-gray-600">${ICONS.back}</a>
       <span class="font-bold">Trash Can</span>
    </nav>
    <div class="p-4 max-w-4xl mx-auto">
      <ul class="space-y-3">
        ${posts.results.map((p: any) => `
          <li class="bg-white p-4 rounded shadow flex items-center justify-between">
            <span class="text-gray-500 truncate w-1/2">${p.title}</span>
            <div class="flex gap-2">
               <form action="/admin/restore" method="POST">
                 <input type="hidden" name="id" value="${p.id}">
                 <button class="text-green-600 text-sm font-bold border border-green-200 px-3 py-1 rounded hover:bg-green-50">Restore</button>
               </form>
               <form action="/admin/destroy" method="POST" onsubmit="return confirm('Permanently delete?')">
                 <input type="hidden" name="id" value="${p.id}">
                 <button class="text-red-600 text-sm font-bold border border-red-200 px-3 py-1 rounded hover:bg-red-50">Delete Forever</button>
               </form>
            </div>
          </li>
        `).join('')}
        ${posts.results.length === 0 ? '<p class="text-center text-gray-400 mt-10">Trash is empty.</p>' : ''}
      </ul>
    </div>
  `
  return c.html(Layout(html))
})

// 5. Announcements & Stats
app.get('/admin/announcements', adminAuth, async (c) => {
  const list = await c.env.DB.prepare("SELECT * FROM announcements ORDER BY created_at DESC").all()
  
  const html = `
    <nav class="bg-white border-b px-4 py-3 flex items-center gap-2">
       <a href="/admin/dashboard" class="text-gray-600">${ICONS.back}</a>
       <span class="font-bold">Announcements</span>
    </nav>
    <div class="p-4 max-w-lg mx-auto">
      <form method="POST" class="mb-6 flex gap-2">
        <input type="text" name="content" required placeholder="New announcement..." class="flex-1 border p-2 rounded">
        <button class="bg-blue-600 text-white px-4 rounded font-bold">Add</button>
      </form>
      <ul class="space-y-2">
        ${list.results.map((a: any) => `
          <li class="bg-white p-3 rounded shadow flex justify-between items-center">
            <span class="text-sm text-gray-800">${a.content}</span>
            <form method="POST" action="/admin/announcement/delete">
               <input type="hidden" name="id" value="${a.id}">
               <button class="text-red-500 hover:text-red-700 font-bold px-2">X</button>
            </form>
          </li>
        `).join('')}
      </ul>
    </div>
  `
  return c.html(Layout(html))
})

app.post('/admin/announcements', adminAuth, async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare("INSERT INTO announcements (content) VALUES (?)").bind(body.content).run()
  return c.redirect('/admin/announcements')
})

app.post('/admin/announcement/delete', adminAuth, async (c) => {
  const body = await c.req.parseBody()
  await c.env.DB.prepare("DELETE FROM announcements WHERE id = ?").bind(body.id).run()
  return c.redirect('/admin/announcements')
})

app.get('/admin/stats', adminAuth, async (c) => {
  const v = await c.env.DB.prepare("SELECT count FROM visitors WHERE id = 1").first()
  const html = `
    <nav class="bg-white border-b px-4 py-3 flex items-center gap-2">
       <a href="/admin/dashboard" class="text-gray-600">${ICONS.back}</a>
       <span class="font-bold">Statistics</span>
    </nav>
    <div class="p-8 text-center">
      <div class="bg-white p-8 rounded-2xl shadow-lg inline-block">
         <h3 class="text-gray-500 uppercase text-sm tracking-wide mb-2">Total Website Visitors</h3>
         <p class="text-5xl font-extrabold text-blue-600">${(v as any).count}</p>
      </div>
    </div>
  `
  return c.html(Layout(html))
})

export default app

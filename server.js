const express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('express-flash');
const path = require('path');
const bcrypt = require('bcryptjs');
const {
  db,
  findUserByEmail,
  findUserById,
  findTicketById,
  escapeHtml
} = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// --- Middleware ---
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({
  secret: 'helpdesk-secret-key-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000 } // 7 days
}));
app.use(flash());
app.use((req, res, next) => {
  res.locals.message = req.flash('error');
  res.locals.success = req.flash('success');
  res.locals.error = req.query.error;
  res.locals.registered = req.query.registered;
  res.locals.user = req.session;
  next();
});
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static(path.join(__dirname, 'public')));

// --- Helpers ---
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.redirect('/login');
  }
  next();
};

const isTechnician = (req, res, next) => {
  if (!req.session.isTechnician) {
    return res.redirect('/dashboard');
  }
  next();
};

// --- Auth routes ---
app.get('/register', (req, res) => {
  res.render('register', {
    error: req.query.error,
    registered: req.query.registered
  });
});

app.post('/register', (req, res) => {
  const { name, email, password, role } = req.body;
  const existing = findUserByEmail(email);
  if (existing) {
    return res.redirect('/register?error=Email already registered');
  }
  const hashedPassword = bcrypt.hashSync(password, 10);
  const newUser = {
    id: db.users.length + 1,
    name,
    email,
    password: hashedPassword,
    role: role || 'user'
  };
  db.users.push(newUser);
  res.redirect('/login?registered=1');
});

app.get('/login', (req, res) => {
  res.render('login', {
    error: req.query.error,
    login: req.query.login
  });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  const user = findUserByEmail(email);
  if (!user) {
    return res.redirect('/login?error=Invalid credentials');
  }
  const passwordMatch = bcrypt.compareSync(password, user.password);
  if (!passwordMatch) {
    return res.redirect('/login?error=Invalid credentials');
  }
  req.session.userId = user.id;
  req.session.isTechnician = user.role === 'technician';
  req.session.userName = user.name;
  req.session.userRole = user.role;
  res.redirect('/dashboard');
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

// --- Dashboard ---
app.get('/dashboard', requireAuth, (req, res) => {
  const userId = req.session.userId;
  const user = findUserById(userId);

  const myTickets = db.tickets.filter(t => t.assigneeId === userId || t.requestorId === userId);

  const stats = {
    total: db.tickets.length,
    open: db.tickets.filter(t => t.status === 'open').length,
    inProgress: db.tickets.filter(t => t.status === 'in_progress').length,
    resolved: db.tickets.filter(t => t.status === 'resolved').length,
    closed: db.tickets.filter(t => t.status === 'closed').length
  };

  const openTickets = db.tickets.filter(t => t.status === 'open' && !t.assigneeId);

  res.render('dashboard', {
    userName: req.session.userName,
    isTechnician: req.session.isTechnician,
    stats,
    myTickets,
    openTickets,
    user: user ? user.name : null
  });
});

// --- Ticket routes ---
app.get('/tickets', requireAuth, (req, res) => {
  const { status, category, search } = req.query;
  let tickets = [...db.tickets];

  if (status) {
    tickets = tickets.filter(t => t.status === status);
  }
  if (category) {
    tickets = tickets.filter(t => t.category === category);
  }
  if (search) {
    const q = search.toLowerCase();
    tickets = tickets.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q)
    );
  }

  // For technicians: show all tickets; for users: only their own
  if (!req.session.isTechnician) {
    tickets = tickets.filter(t => t.requestorId === req.session.userId);
  }

  // Sort by newest first
  tickets.sort((a, b) => b.createdAt - a.createdAt);

  const categories = ['hardware', 'software', 'network', 'other'];

  res.render('tickets', {
    userName: req.session.userName,
    isTechnician: req.session.isTechnician,
    tickets,
    status,
    category,
    search,
    categories
  });
});

app.get('/tickets/new', requireAuth, (req, res) => {
  const users = db.users;
  const technicians = users.filter(u => u.role === 'technician');
  const isTech = req.session.isTechnician;
  res.render('ticket-form', {
    userName: req.session.userName,
    categories: ['hardware', 'software', 'network', 'other'],
    priorities: ['low', 'medium', 'high', 'critical'],
    isTechnician: isTech,
    technicians: isTech ? technicians : [],
    action: 'create'
  });
});

app.post('/tickets', requireAuth, (req, res) => {
  const { title, description, category, priority, assigneeId } = req.body;
  if (!title || !description) {
    return res.redirect('/tickets/new?error=Title and description required');
  }

  const ticket = {
    id: db.nextTicketId,
    title: escapeHtml(title.trim()),
    description: escapeHtml(description.trim()),
    category: category || 'other',
    priority: priority || 'medium',
    status: 'open',
    assigneeId: assigneeId || null,
    requestorId: req.session.userId,
    createdAt: Date.now(),
    updatedAt: Date.now()
  };

  db.tickets.push(ticket);
  db.nextTicketId += 1;

  res.redirect('/tickets');
});

app.get('/tickets/:id', requireAuth, (req, res) => {
  const ticketId = Number(req.params.id);
  const ticket = findTicketById(ticketId);
  if (!ticket) {
    return res.redirect('/tickets?error=Ticket not found');
  }

  // Users can only view their own tickets
  if (!req.session.isTechnician && ticket.requestorId !== req.session.userId) {
    return res.redirect('/tickets?error=Access denied');
  }

  const comments = db.comments
    .filter(c => c.ticketId === ticketId)
    .sort((a, b) => a.createdAt - b.createdAt);

  const users = db.users;

  const isTechnician = req.session.isTechnician;

  res.render('ticket-detail', {
    userName: req.session.userName,
    isTechnician,
    ticket,
    comments,
    users,
    canEdit: isTechnician
  });
});

app.post('/tickets/:id/comments', requireAuth, (req, res) => {
  const ticket = findTicketById(Number(req.params.id));
  if (!ticket) {
    return res.redirect('/tickets?error=Ticket not found');
  }
  if (!req.session.isTechnician && ticket.requestorId !== req.session.userId) {
    return res.redirect('/tickets?error=Access denied');
  }

  const { text } = req.body;
  if (!text) {
    return res.redirect(`/tickets/${req.params.id}?error=Comment required`);
  }

  const comment = {
    id: db.comments.length + 1,
    ticketId: ticket.id,
    userId: req.session.userId,
    userName: req.session.userName,
    text: escapeHtml(text.trim()),
    createdAt: Date.now()
  };

  db.comments.push(comment);

  res.redirect(`/tickets/${ticket.id}`);
});

app.post('/tickets/:id/status', requireAuth, isTechnician, (req, res) => {
  const ticket = findTicketById(Number(req.params.id));
  if (!ticket) {
    return res.redirect('/tickets?error=Ticket not found');
  }

  const { status } = req.body;
  const validStatuses = ['open', 'in_progress', 'resolved', 'closed'];
  if (!validStatuses.includes(status)) {
    return res.redirect(`/tickets/${ticket.id}?error=Invalid status`);
  }

  const index = db.tickets.findIndex(t => t.id === ticket.id);
  if (index !== -1) {
    db.tickets[index] = {
      ...ticket,
      status,
      updatedAt: Date.now()
    };
  }

  res.redirect(`/tickets/${ticket.id}`);
});

// --- 404 handler ---
app.use((req, res) => {
  res.status(404).render('404');
});

// --- Start server ---
app.listen(PORT, () => {
  console.log(`\n🚀 Helpdesk Ticketing System running at http://localhost:${PORT}`);
  console.log('   Default admin: admin@test.com / admin123\n');
});

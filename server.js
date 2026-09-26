/**
 * DVARY HOSTING
 * File: server.js
 * Entry point ya application
 */

'use strict';

// ============================
// CORE MODULES
// ============================
const path = require('path');

// ============================
// ENV VARIABLES (LAZIMA IWE YA KWANZA)
// ============================
require('dotenv').config();

// ============================
// THIRD-PARTY MODULES
// ============================
const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const methodOverride = require('method-override');
const flash = require('connect-flash');
const helmet = require('helmet');
const morgan = require('morgan');

// ============================
// INTERNAL MODULES
// ============================
const connectDatabase = require('./config/database');
const logger = require('./utils/logger');

// ============================
// ROUTES
// ============================
const indexRoutes = require('./routes/index');
const authRoutes = require('./routes/auth');
const dashboardRoutes = require('./routes/dashboard');
const botsRoutes = require('./routes/bots');
const deployRoutes = require('./routes/deploy');
const serversRoutes = require('./routes/servers');
const coinsRoutes = require('./routes/coins');
const adminRoutes = require('./routes/admin');

// ============================
// APP INIT
// ============================
const app = express();

// ============================
// VIEW ENGINE
// ============================
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ============================
// SECURITY MIDDLEWARE
// ============================
app.use(
  helmet({
    contentSecurityPolicy: false, // inaruhusu inline CSS ndani ya EJS <style>
    crossOriginEmbedderPolicy: false,
  })
);

// ============================
// BODY PARSERS
// ============================
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(express.json({ limit: '5mb' }));

// ============================
// METHOD OVERRIDE (PUT / DELETE kutoka forms)
// ============================
app.use(methodOverride('_method'));

// ============================
// STATIC FILES
// ============================
app.use(express.static(path.join(__dirname, 'public')));

// ============================
// LOGGING (dev pekee)
// ============================
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
}

// ============================
// DATABASE
// ============================
connectDatabase();

// ============================
// SESSIONS
// ============================
app.use(
  session({
    name: 'dvary.sid',
    secret: process.env.SESSION_SECRET || 'DVARY_FALLBACK_SECRET_CHANGE_ME',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGO_URI,
      collectionName: 'sessions',
      ttl: 14 * 24 * 60 * 60, // siku 14
      autoRemove: 'native',
    }),
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 14 * 24 * 60 * 60 * 1000, // siku 14
    },
  })
);

// ============================
// FLASH MESSAGES
// ============================
app.use(flash());

// ============================
// GLOBAL LOCALS (zinapatikana kwenye EJS zote)
// ============================
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.isAdmin = req.session.user && req.session.user.role === 'admin';
  res.locals.success = req.flash('success');
  res.locals.error = req.flash('error');
  res.locals.warning = req.flash('warning');
  res.locals.info = req.flash('info');
  res.locals.appName = 'DVARY HOSTING';
  res.locals.currentPath = req.path;
  next();
});

// ============================
// ROUTES MOUNT
// ============================
app.use('/', indexRoutes);
app.use('/auth', authRoutes);
app.use('/dashboard', dashboardRoutes);
app.use('/bots', botsRoutes);
app.use('/deploy', deployRoutes);
app.use('/servers', serversRoutes);
app.use('/coins', coinsRoutes);
app.use('/admin', adminRoutes);

// ============================
// 404 HANDLER
// ============================
app.use((req, res) => {
  res.status(404).render('404', {
    title: '404 - Haipatikani',
    message: 'Ukurasa ulioomba haupatikani.',
  });
});

// ============================
// GLOBAL ERROR HANDLER
// ============================
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);

  const status = err.status || 500;
  const message =
    process.env.NODE_ENV === 'production'
      ? 'Hitilafu imetokea. Tafadhali jaribu tena baadaye.'
      : err.message || 'Hitilafu isiyojulikana.';

  // Kama ni API request, rudisha JSON
  if (req.originalUrl.startsWith('/api') || req.xhr) {
    return res.status(status).json({
      success: false,
      message,
    });
  }

  // Vinginevyo rudisha ukurasa wa error
  res.status(status).render('404', {
    title: `Error ${status}`,
    message,
  });
});

// ============================
// SERVER LISTEN
// ============================
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
  logger.info(`DVARY HOSTING imeanza kwenye port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

// ============================
// GRACEFUL SHUTDOWN
// ============================
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception:', err);
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM imepokelewa. Inafunga server...');
  server.close(() => {
    logger.info('Server imefungwa.');
    process.exit(0);
  });
});

module.exports = app;

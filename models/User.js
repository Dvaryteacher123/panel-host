/**
 * DVARY HOSTING
 * File: models/User.js
 * User model - Mongo Schema
 */

'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: [true, 'Username inahitajika'],
      unique: true,
      trim: true,
      minlength: [3, 'Username iwe angalau herufi 3'],
      maxlength: [30, 'Username isizidi herufi 30'],
      match: [/^[a-zA-Z0-9_]+$/, 'Username iwe na herufi, namba au underscore pekee'],
    },

    email: {
      type: String,
      required: [true, 'Email inahitajika'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Email si sahihi'],
    },

    password: {
      type: String,
      required: [true, 'Password inahitajika'],
      minlength: [8, 'Password iwe angalau herufi 8'],
      select: false,
    },

    role: {
      type: String,
      enum: ['user', 'admin'],
      default: 'user',
    },

    coins: {
      type: Number,
      default: 0,
      min: [0, 'Coins haziwezi kuwa chini ya 0'],
    },

    status: {
      type: String,
      enum: ['active', 'suspended', 'banned'],
      default: 'active',
    },

    pterodactylUserId: {
      type: Number,
      default: null,
    },

    pterodactylUsername: {
      type: String,
      default: null,
    },

    avatar: {
      type: String,
      default: null,
    },

    phone: {
      type: String,
      default: null,
      trim: true,
    },

    country: {
      type: String,
      default: null,
      trim: true,
    },

    lastLogin: {
      type: Date,
      default: null,
    },

    lastLoginIp: {
      type: String,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ============================
// INDEXES
// ============================
userSchema.index({ role: 1 });
userSchema.index({ status: 1 });
userSchema.index({ createdAt: -1 });

// ============================
// VIRTUALS
// ============================
userSchema.virtual('isAdmin').get(function () {
  return this.role === 'admin';
});

userSchema.virtual('isActive').get(function () {
  return this.status === 'active';
});

// ============================
// PRE-SAVE: HASH PASSWORD
// ============================
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

// ============================
// METHODS
// ============================
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

// ============================
// STATICS
// ============================
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.statics.findByUsername = function (username) {
  return this.findOne({ username: username.trim() });
};

module.exports = mongoose.model('User', userSchema);

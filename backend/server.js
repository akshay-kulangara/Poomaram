require('dotenv').config();
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const bcrypt = require("bcrypt");
const session = require("express-session");
const crypto = require("crypto");
const http = require("http");

const app = express();

// ================= TELEGRAM NOTIFIER CONFIGURATION =================
const TELEGRAM_NOTIFIER_URL = process.env.TELEGRAM_NOTIFIER_URL || 'http://127.0.0.1:3001'
const ENABLE_TELEGRAM = process.env.ENABLE_TELEGRAM !== 'false'; // Enabled by default

// CORS configuration to allow credentials
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow all origins in development
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['set-cookie']
}));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: false, // Set to true if using HTTPS
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    sameSite: 'lax', // Allows cookies to be sent with same-site requests
    path: '/'
  },
  name: 'taskmanager.sid' // Custom session name
}));

// Increase payload size limits
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use("/uploads", express.static("uploads"));

// ================= DB CONNECTION =================
//
const db = mysql.createPool({
  host: process.env.DB_HOST || "127.0.0.1",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "taskdb",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

db.getConnection((err, connection) => {
  if (err) {
    console.error("DB pool error:", err);
  } else {
    console.log("MySQL Connected ✅");
    connection.release();
  }
});

// ================= TELEGRAM NOTIFICATION HELPER =================
async function sendTelegramNotification(type, message, icon = '📝') {
  if (!ENABLE_TELEGRAM) {
    return; // Telegram notifications disabled
  }

  const postData = JSON.stringify({ type, message, icon });
  
  const url = new URL(TELEGRAM_NOTIFIER_URL);
  const options = {
    hostname: url.hostname,
    port: url.port || 3001,
    path: '/notify',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(postData)
    },
    timeout: 5000, // 5 second timeout
    family: 0 // Allow both IPv4 and IPv6
  };

  return new Promise((resolve) => {
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200) {
          console.log(`📱 Telegram notification sent: ${type}`);
        } else {
          console.error(`⚠️  Telegram notification failed: ${res.statusCode}`);
        }
        resolve();
      });
    });

    req.on('error', (error) => {
      console.error('⚠️  Telegram notifier unreachable:', error.message);
      resolve(); // Don't fail the main operation
    });

    req.on('timeout', () => {
      req.destroy();
      console.error('⚠️  Telegram notification timeout');
      resolve();
    });

    req.write(postData);
    req.end();
  });
}

// ================= ACTIVITY LOGGER =================
function logActivity(type, message, icon = '📝', username = null) {
  // Log to database
  db.query(
    "INSERT INTO activities (type, message, icon) VALUES (?, ?, ?)",
    [type, message, icon],
    (err) => {
      if (err) {
        console.error("Failed to log activity:", err);
      }
    }
  );

  // Add username to message if provided
  const fullMessage = username ? `👤 ${username}: ${message}` : message;

  // Send Telegram notification (non-blocking)
  sendTelegramNotification(type, fullMessage, icon).catch(err => {
    console.error('Telegram notification error:', err);
  });
}

// ================= FILE UPLOAD =================
const storage = multer.diskStorage({
  destination: "./uploads/",
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    // Accept images only
    const allowedTypes = /jpeg|jpg|png|gif|webp|heic|bmp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else if (mimetype || extname) {
      // If either matches, still accept (some browsers send wrong MIME types)
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (jpeg, jpg, png, gif, webp, heic, bmp)'));
    }
  }
});

// ================= AUTHENTICATION MIDDLEWARE =================
const requireAuth = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  next();
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: "Authentication required" });
  }
  
  // Check if user is admin
  db.query(
    "SELECT role FROM users WHERE id = ?",
    [req.session.userId],
    (err, result) => {
      if (err || result.length === 0) {
        return res.status(500).json({ error: "Failed to verify user role" });
      }
      
      if (result[0].role !== 'admin') {
        return res.status(403).json({ error: "Admin access required" });
      }
      
      next();
    }
  );
};

// ================= REUSABLE DELETE HELPER =================
/**
 * Generic delete handler for entities with related assignments
 * Eliminates code duplication between task and roommate deletion
 */
const deleteEntityWithAssignments = (config) => {
  return (req, res) => {
    const { id } = req.params;
    const { entityType, tableName, nameColumn, assignmentColumn, activityIcon } = config;

    // Step 1: Get entity name for activity log
    db.query(
      `SELECT ${nameColumn} FROM ${tableName} WHERE id = ?`,
      [id],
      (err, result) => {
        if (err) {
          console.error(`DELETE /${entityType} lookup error:`, err);
          return res.status(500).json({
            error: `Failed to find ${entityType}`,
            details: err.code || err.message
          });
        }

        if (result.length === 0) {
          return res.status(404).json({ error: `${entityType} not found` });
        }

        const entityName = result[0][nameColumn] || `Unknown ${entityType}`;

        // Step 2: Delete related assignments first
        db.query(
          `DELETE FROM assignments WHERE ${assignmentColumn} = ?`,
          [id],
          (err2) => {
            if (err2) {
              console.error(`DELETE ${entityType} assignments error:`, err2);
              return res.status(500).json({
                error: `Failed to delete ${entityType} assignments`,
                details: err2.code || err2.message
              });
            }

            // Step 3: Delete the entity itself
            db.query(
              `DELETE FROM ${tableName} WHERE id = ?`,
              [id],
              (err3) => {
                if (err3) {
                  console.error(`DELETE ${entityType} error:`, err3);
                  return res.status(500).json({
                    error: `Failed to delete ${entityType}`,
                    details: err3.code || err3.message
                  });
                }

                // Step 4: Log activity and respond
                const capitalizedType = entityType.charAt(0).toUpperCase() + entityType.slice(1);
                logActivity(entityType, `Deleted ${entityType} "${entityName}"`, activityIcon, req.session.username);
                res.json({ message: `${capitalizedType} deleted` });
              }
            );
          }
        );
      }
    );
  };
};

// ================= AUTHENTICATION ROUTES =================

// Register new user
app.post("/api/auth/register", upload.single("photo"), async (req, res) => {
  const { username, email, password, fullName } = req.body;
  const photo = req.file ? req.file.filename : null;

  // Validate input
  if (!username || !email || !password) {
    return res.status(400).json({ error: "Username, email, and password are required" });
  }

  if (username.length < 3) {
    return res.status(400).json({ error: "Username must be at least 3 characters" });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Invalid email format" });
  }

  try {
    // Check if user already exists
    const [existingUsers] = await db.promise().query(
      "SELECT id FROM users WHERE username = ? OR email = ?",
      [username, email]
    );

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: "Username or email already exists" });
    }

    // Hash password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Insert new user
    const [result] = await db.promise().query(
      "INSERT INTO users (username, email, password_hash, full_name, photo) VALUES (?, ?, ?, ?, ?)",
      [username, email, passwordHash, fullName || null, photo]
    );

    const userId = result.insertId;
    const displayName = fullName || username;

    // Automatically add user to roommates table with user_id link
    await db.promise().query(
      "INSERT INTO roommates (name, photo, user_id) VALUES (?, ?, ?)",
      [displayName, photo, userId]
    );

    // Create session
    req.session.userId = userId;
    req.session.username = username;

    logActivity('user', `New user "${username}" registered and added as roommate`, '👤', username);

    res.json({
      message: "Registration successful",
      user: {
        id: userId,
        username: username,
        email: email,
        fullName: fullName || null,
        photo: photo
      }
    });
  } catch (err) {
    console.error("Registration error:", err);
    res.status(500).json({ error: "Registration failed", details: err.message });
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }

  try {
    // Find user
    const [users] = await db.promise().query(
      "SELECT id, username, email, password_hash, full_name, is_active, role FROM users WHERE username = ? OR email = ?",
      [username, username]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    const user = users[0];

    if (!user.is_active) {
      return res.status(403).json({ error: "Account is disabled" });
    }

    // Verify password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);

    if (!passwordMatch) {
      return res.status(401).json({ error: "Invalid username or password" });
    }

    // Update last login
    await db.promise().query(
      "UPDATE users SET last_login = NOW() WHERE id = ?",
      [user.id]
    );

    // Create session
    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;

    logActivity('user', `Logged in`, '🔐', user.username);

    res.json({
      message: "Login successful",
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.full_name,
        role: user.role
      }
    });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Login failed", details: err.message });
  }
});

// Logout
app.post("/api/auth/logout", (req, res) => {
  const username = req.session.username;
  
  req.session.destroy((err) => {
    if (err) {
      console.error("Logout error:", err);
      return res.status(500).json({ error: "Logout failed" });
    }
    
    if (username) {
      logActivity('user', `Logged out`, '👋', username);
    }
    
    res.json({ message: "Logout successful" });
  });
});

// Check authentication status
app.get("/api/auth/status", (req, res) => {
  if (req.session.userId) {
    db.query(
      "SELECT id, username, email, full_name, role, photo FROM users WHERE id = ?",
      [req.session.userId],
      (err, result) => {
        if (err || result.length === 0) {
          return res.json({ authenticated: false });
        }
        
        res.json({
          authenticated: true,
          user: {
            id: result[0].id,
            username: result[0].username,
            email: result[0].email,
            fullName: result[0].full_name,
            role: result[0].role,
            photo: result[0].photo
          }
        });
      }
    );
  } else {
    res.json({ authenticated: false });
  }
});

// ================= ADMIN USER MANAGEMENT =================

// Reset user password (Admin only)
app.post("/api/admin/reset-password", requireAdmin, async (req, res) => {
  const { userId, newPassword } = req.body;

  // Validate input
  if (!userId || !newPassword) {
    return res.status(400).json({ error: "User ID and new password are required" });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters" });
  }

  try {
    // Check if user exists
    const [users] = await db.promise().query(
      "SELECT id, username, email FROM users WHERE id = ?",
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = users[0];

    // Hash new password
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(newPassword, saltRounds);

    // Update password
    await db.promise().query(
      "UPDATE users SET password_hash = ? WHERE id = ?",
      [passwordHash, userId]
    );

    logActivity('admin', `Reset password for user "${user.username}"`, '🔑', req.session.username);

    res.json({
      message: "Password reset successfully",
      username: user.username
    });
  } catch (err) {
    console.error("Password reset error:", err);
    res.status(500).json({ error: "Failed to reset password", details: err.message });
  }
});

// Get all users (Admin only)
app.get("/api/admin/users", requireAdmin, (req, res) => {
  db.query(
    "SELECT id, username, email, full_name, role, is_active, created_at, last_login FROM users ORDER BY username",
    (err, result) => {
      if (err) {
        console.error("GET /api/admin/users error:", err);
        return res.status(500).json({ error: "Failed to fetch users", details: err.code || err.message });
      }
      res.json(result);
    }
  );
});

// ================= ROUTES =================

// Get tasks
app.get("/api/tasks", requireAuth, (req, res) => {
  db.query("SELECT * FROM tasks ORDER BY created_at DESC, id DESC", (err, result) => {
    if (err) {
      console.error("GET /api/tasks error:", err);
      return res.status(500).json({ error: "Failed to fetch tasks", details: err.code || err.message });
    }
    res.json(result);
  });
});

// Add task (Admin only)
app.post("/api/tasks", requireAdmin, (req, res) => {
  const { name, frequency, duration } = req.body;

  // Validate required fields
  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Task name is required" });
  }

  if (name.length > 100) {
    return res.status(400).json({ error: "Task name must be 100 characters or less" });
  }

  const taskName = name.trim();
  const taskFrequency = frequency || "one-time";
  const taskDuration = duration || null;

  console.log("Creating task:", { name: taskName, frequency: taskFrequency, duration: taskDuration });

  db.query(
    "INSERT INTO tasks (name, frequency, duration) VALUES (?, ?, ?)",
    [taskName, taskFrequency, taskDuration],
    (err) => {
      if (err) {
        console.error("POST /api/tasks error:", err);
        return res.status(500).json({ error: "Failed to add task", details: err.code || err.message });
      }
      logActivity('task', `Created new task "${taskName}"`, '➕', req.session.username);
      res.json({ message: "Task added successfully" });
    }
  );
});

// Update task and optionally manually assign it to one member (Admin only)
app.put("/api/tasks/:id", requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { name, frequency, duration, assigneeId } = req.body;

  if (!name || name.trim() === "") {
    return res.status(400).json({ error: "Task name is required" });
  }

  if (name.trim().length > 100) {
    return res.status(400).json({ error: "Task name must be 100 characters or less" });
  }

  let connection;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    const [taskRows] = await connection.query(
      "SELECT id FROM tasks WHERE id = ?",
      [id]
    );

    if (taskRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Task not found" });
    }

    await connection.query(
      "UPDATE tasks SET name = ?, frequency = ?, duration = ? WHERE id = ?",
      [name.trim(), frequency || "one-time", duration || null, id]
    );

    // assigneeId is only accepted by this admin-only endpoint.
    // null/empty explicitly means that the task should be unassigned.
    if (assigneeId !== undefined) {
      if (assigneeId !== null && assigneeId !== "") {
        const [userRows] = await connection.query(
          "SELECT id, COALESCE(full_name, username) AS name FROM users WHERE id = ? AND is_active = 1",
          [assigneeId]
        );

        if (userRows.length === 0) {
          await connection.rollback();
          return res.status(400).json({ error: "Selected member is not active or does not exist" });
        }

        // One member per task: replace any existing assignment.
        await connection.query(
          "DELETE FROM assignments WHERE task_id = ?",
          [id]
        );

        await connection.query(
          `INSERT INTO assignments
             (task_id, roommate_id, status, assigned_date, completed_date, completion_photo, completion_notes)
           VALUES (?, ?, 'pending', CURRENT_TIMESTAMP, NULL, NULL, NULL)`,
          [id, assigneeId]
        );

        await connection.query(
          "UPDATE tasks SET status = 'pending' WHERE id = ?",
          [id]
        );

        await connection.commit();

        logActivity(
          'assignment',
          `Updated task "${name.trim()}" and manually assigned it to ${userRows[0].name}`,
          '👤',
          req.session.username
        );

        return res.json({
          message: "Task updated and assigned successfully",
          assignedTo: {
            id: userRows[0].id,
            name: userRows[0].name
          }
        });
      }

      // Explicitly unassigned.
      await connection.query(
        "DELETE FROM assignments WHERE task_id = ?",
        [id]
      );

      await connection.query(
        "UPDATE tasks SET status = 'pending' WHERE id = ?",
        [id]
      );
    }

    await connection.commit();

    logActivity(
      'task',
      `Updated task "${name.trim()}"${assigneeId !== undefined ? ' and unassigned' : ''}`,
      '✏️',
      req.session.username
    );

    res.json({
      message: assigneeId !== undefined
        ? "Task updated and unassigned successfully"
        : "Task updated"
    });
  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback error:", rollbackErr);
      }
    }

    console.error("PUT /api/tasks/:id error:", err);
    res.status(500).json({
      error: "Failed to update task",
      details: err.code || err.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Delete task (Admin only) - Using reusable helper
app.delete("/api/tasks/:id", requireAdmin, deleteEntityWithAssignments({
  entityType: 'task',
  tableName: 'tasks',
  nameColumn: 'name',
  assignmentColumn: 'task_id',
  activityIcon: '🗑️'
}));

// Get roommates
app.get("/api/roommates", requireAuth, (req, res) => {
  db.query("SELECT * FROM roommates", (err, result) => {
    if (err) {
      console.error("GET /api/roommates error:", err);
      return res.status(500).json({ error: "Failed to fetch roommates", details: err.code || err.message });
    }
    res.json(result);
  });
});

// Add roommate
app.post("/api/roommates", requireAuth, upload.single("photo"), (req, res) => {
  const { name } = req.body;
  const photo = req.file ? req.file.filename : null;

  db.query(
    "INSERT INTO roommates (name, photo) VALUES (?, ?)",
    [name, photo],
    (err) => {
      if (err) {
        console.error("POST /api/roommates error:", err);
        return res.status(500).json({ error: "Failed to add roommate", details: err.code || err.message });
      }
      logActivity('roommate', `Added new roommate "${name}"`, '👤', req.session.username);
      res.json({ message: "Roommate added" });
    }
  );
});

// Update roommate (Admin only)
app.put("/api/roommates/:id", requireAdmin, upload.single("photo"), async (req, res) => {
  const { id } = req.params;
  const { name } = req.body;
  const photo = req.file ? req.file.filename : null;

  let connection;

  try {
    connection = await db.promise().getConnection();
    await connection.beginTransaction();

    // Find the user linked to this roommate
    const [roommateRows] = await connection.query(
      "SELECT user_id FROM roommates WHERE id = ?",
      [id]
    );

    if (roommateRows.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: "Roommate not found" });
    }

    const userId = roommateRows[0].user_id;

    if (photo) {
      // Update roommate record
      await connection.query(
        "UPDATE roommates SET name = ?, photo = ? WHERE id = ?",
        [name, photo, id]
      );

      // If this roommate belongs to a registered user,
      // synchronize the user's profile photo as well.
      if (userId) {
        await connection.query(
          "UPDATE users SET photo = ? WHERE id = ?",
          [photo, userId]
        );

        console.log(
          `Photo synchronized: roommate_id=${id}, user_id=${userId}, photo=${photo}`
        );
      }
    } else {
      // No new photo - only update the roommate name
      await connection.query(
        "UPDATE roommates SET name = ? WHERE id = ?",
        [name, id]
      );
    }

    await connection.commit();

    logActivity(
      "roommate",
      photo
        ? `Updated roommate "${name}" and synchronized profile photo`
        : `Updated roommate "${name}"`,
      "✏️",
      req.session.username
    );

    res.json({
      message: photo
        ? "Roommate and profile photo updated"
        : "Roommate updated",
      photo: photo || undefined
    });

  } catch (err) {
    if (connection) {
      try {
        await connection.rollback();
      } catch (rollbackErr) {
        console.error("Rollback error:", rollbackErr);
      }
    }

    console.error("PUT /api/roommates/:id error:", err);

    res.status(500).json({
      error: "Failed to update roommate",
      details: err.code || err.message
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// Get assignments

app.get("/api/assignments", requireAuth, (req, res) => {
  db.query(
    `SELECT
       a.id,
       a.task_id,
       a.roommate_id,
       a.status,
       a.assigned_date,
       a.completed_date,
       a.completion_photo,
       a.completion_notes,
       t.name AS task_name,
       t.frequency,
       t.duration,
       COALESCE(u.full_name, u.username) AS roommate_name,
       u.photo AS roommate_photo
     FROM assignments a
     JOIN tasks t ON a.task_id = t.id
     JOIN users u ON a.roommate_id = u.id
     ORDER BY a.assigned_date DESC`,
    (err, result) => {
      if (err) {
        console.error("GET /api/assignments error:", err);
        return res.status(500).json({ error: "Failed to fetch assignments", details: err.code || err.message });
      }
      res.json(result);
    }
  );
});

// Get recent activities
app.get("/api/activities", requireAuth, (req, res) => {
  db.query(
    "SELECT DISTINCT message, type, icon, MAX(created_at) as created_at FROM activities GROUP BY message, type, icon ORDER BY created_at DESC LIMIT 10",
    (err, result) => {
      if (err) {
        console.error("GET /api/activities error:", err);
        return res.status(500).json({ error: "Failed to fetch activities", details: err.code || err.message });
      }
      res.json(result);
    }
  );
});

// Get users list
app.get("/api/users", requireAuth, (req, res) => {
  db.query(
    "SELECT id, username, email, full_name, photo FROM users WHERE is_active = 1 ORDER BY COALESCE(full_name, username)",
    (err, result) => {
      if (err) {
        console.error("GET /api/users error:", err);
        return res.status(500).json({ error: "Failed to fetch users", details: err.code || err.message });
      }
      res.json(result);
    }
  );
});

// Get waste bin entries
app.get("/api/waste-bin", requireAuth, (req, res) => {
  db.query(
    `SELECT
       w.id,
       w.roommate_id,
       w.dumped_date,
       w.created_at,
       COALESCE(u.full_name, u.username) AS roommate_name,
       u.photo AS roommate_photo
     FROM waste_bin_entries w
     JOIN users u ON w.roommate_id = u.id
     ORDER BY w.dumped_date DESC, w.created_at DESC`,
    (err, result) => {
      if (err) {
        console.error("GET /api/waste-bin error:", err);
        return res.status(500).json({ error: "Failed to fetch waste bin entries", details: err.code || err.message });
      }
      res.json(result);
    }
  );
});

// Add waste bin entry
app.post("/api/waste-bin", requireAuth, (req, res) => {
  const { roommateId, dumpedDate } = req.body;

  if (!roommateId || !dumpedDate) {
    return res.status(400).json({ error: "Roommate and dumped date are required" });
  }

  db.query(
    "SELECT id, COALESCE(full_name, username) AS name FROM users WHERE id = ?",
    [roommateId],
    (lookupErr, users) => {
      if (lookupErr) {
        console.error("POST /api/waste-bin user lookup error:", lookupErr);
        return res.status(500).json({ error: "Failed to verify user", details: lookupErr.code || lookupErr.message });
      }

      if (!users.length) {
        return res.status(404).json({ error: "User not found" });
      }

      db.query(
        "INSERT INTO waste_bin_entries (roommate_id, dumped_date) VALUES (?, ?)",
        [roommateId, dumpedDate],
        (insertErr) => {
          if (insertErr) {
            console.error("POST /api/waste-bin error:", insertErr);
            if (insertErr.code === 'ER_DUP_ENTRY') {
              return res.status(409).json({ error: "This user already has a waste bin entry for that date" });
            }
            return res.status(500).json({ error: "Failed to add waste bin entry", details: insertErr.code || insertErr.message });
          }

          logActivity('waste-bin', `${users[0].name} dumped the waste on ${dumpedDate}`, '🗑️', req.session.username);
          res.json({ message: "Waste bin entry added successfully" });
        }
      );
    }
  );
});

// Complete a task
app.post("/api/assignments/:id/complete", requireAuth, (req, res) => {
  // Handle multer upload with error handling
  upload.single("photo")(req, res, (uploadErr) => {
    if (uploadErr) {
      console.error("File upload error:", uploadErr);
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ error: "File too large. Maximum size is 50MB" });
      }
      return res.status(400).json({ error: "File upload failed", details: uploadErr.message });
    }

    const { id } = req.params;
    const { notes } = req.body;
    const photo = req.file ? req.file.filename : null;
    const completedDate = new Date();

    console.log("Complete task request:", { id, notes: notes ? "provided" : "missing", photo: photo ? "uploaded" : "missing" });

    // Validate required fields
    if (!notes || notes.trim() === "") {
      return res.status(400).json({ error: "Completion notes are required" });
    }

    if (!photo) {
      return res.status(400).json({ error: "Completion photo is required" });
    }

  // Get assignment details for activity log and verify ownership
  db.query(
    `SELECT
       a.*,
       t.name as task_name,
       COALESCE(u.full_name, u.username) as roommate_name,
       u.id as assigned_user_id
     FROM assignments a
     JOIN tasks t ON a.task_id = t.id
     JOIN users u ON a.roommate_id = u.id
     WHERE a.id = ?`,
    [id],
    async (err, result) => {
      if (err) {
        console.error("Complete task lookup error:", err);
        return res.status(500).json({ error: "Failed to find assignment", details: err.code || err.message });
      }

      if (!result.length) {
        console.error("Assignment not found:", id);
        return res.status(404).json({ error: "Assignment not found" });
      }

      const assignment = result[0];
      console.log("Found assignment:", { id: assignment.id, task_name: assignment.task_name, roommate_name: assignment.roommate_name });

      const isOwner = assignment.assigned_user_id === req.session.userId;
      const isAdmin = req.session.role === 'admin';

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: "You can only complete your own assigned task" });
      }

      // Update assignment with completion data
      db.query(
        "UPDATE assignments SET status = ?, completed_date = ?, completion_photo = ?, completion_notes = ? WHERE id = ?",
        ["completed", completedDate, photo, notes.trim(), id],
        (updateErr) => {
          if (updateErr) {
            console.error("Complete task update error:", updateErr);
            return res.status(500).json({ error: "Failed to complete task", details: updateErr.code || updateErr.message });
          }

          console.log("Assignment updated successfully");

          // Also update the task status
          db.query(
            "UPDATE tasks SET status = ? WHERE id = ?",
            ["completed", assignment.task_id],
            (taskUpdateErr) => {
              if (taskUpdateErr) {
                console.error("Task status update error:", taskUpdateErr);
              } else {
                console.log("Task status updated successfully");
              }

              logActivity('completion', `Completed task "${assignment.task_name}" (assigned to ${assignment.roommate_name})`, '✅', req.session.username);
              res.json({ message: "Task completed successfully" });
            }
          );
        }
      );
    }
  );
  });
});

// Assign tasks randomly (Admin only)
app.post("/api/assign", requireAdmin, (req, res) => {
  // Specific users for "Sunny Leone" tasks
  const sunnyLeoneUsers = ['Abhiukrish', 'Akash Reji', 'amalanil', 'Bibin B', 'Gautham', 'Glimpson'];
  
  // Specific users for "Mia Khalifia" tasks
  const miaKhalifiaUsers = ['Ajz', 'Ambu', 'Jyothishgopan07', 'Kiran', 'Nidhin'];

  // Get all tasks with their names
  db.query("SELECT id, name FROM tasks", (err, tasks) => {
    if (err) {
      console.error("POST /api/assign tasks lookup error:", err);
      return res.status(500).json({ error: "Failed to load tasks", details: err.code || err.message });
    }

    // Get active users with their linked roommate IDs
    db.query(`
      SELECT u.id, u.username, r.id as roommate_id
      FROM users u
      INNER JOIN roommates r ON u.id = r.user_id
      WHERE u.is_active = 1
    `, (err2, users) => {
      if (err2) {
        console.error("POST /api/assign users lookup error:", err2);
        return res.status(500).json({ error: "Failed to load users", details: err2.code || err2.message });
      }

      if (!tasks.length || !users.length) {
        return res.status(400).json({ error: "Tasks and users are required before assignment" });
      }

      // Get already assigned task IDs
      db.query("SELECT task_id FROM assignments", (assignErr, assignments) => {
        if (assignErr) {
          console.error("POST /api/assign assignments lookup error:", assignErr);
          return res.status(500).json({ error: "Failed to check assignments", details: assignErr.code || assignErr.message });
        }

        // Get list of already assigned task IDs
        const assignedTaskIds = assignments.map(a => a.task_id);
        
        // Filter out tasks that are already assigned
        const unassignedTasks = tasks.filter(task => !assignedTaskIds.includes(task.id));

        // If no unassigned tasks, return a specific response
        if (unassignedTasks.length === 0) {
          return res.status(200).json({ message: "No unassigned tasks", noTasksToAssign: true });
        }

        // Separate tasks into categories
        const sunnyLeoneTasks = unassignedTasks.filter(task =>
          task.name && task.name.toLowerCase().includes('sunny leone')
        );
        
        const miaKhalifiaTasks = unassignedTasks.filter(task =>
          task.name && task.name.toLowerCase().includes('mia khalifia')
        );
        
        const regularTasks = unassignedTasks.filter(task =>
          !task.name ||
          (!task.name.toLowerCase().includes('sunny leone') &&
           !task.name.toLowerCase().includes('mia khalifia'))
        );

        // Filter users for specific task categories
        const sunnyLeoneEligibleUsers = users.filter(user =>
          sunnyLeoneUsers.includes(user.username)
        );
        
        const miaKhalifiaEligibleUsers = users.filter(user =>
          miaKhalifiaUsers.includes(user.username)
        );

        const values = [];
        const assignedUserIds = new Set(); // Track users who got special tasks

        // PRIORITY 1: Assign Sunny Leone tasks to eligible users only
        if (sunnyLeoneTasks.length > 0 && sunnyLeoneEligibleUsers.length > 0) {
          const shuffledSunnyUsers = [...sunnyLeoneEligibleUsers].sort(() => Math.random() - 0.5);
          const sunnyTasksToAssign = sunnyLeoneTasks.slice(0, shuffledSunnyUsers.length);
          
          sunnyTasksToAssign.forEach((task, index) => {
            const user = shuffledSunnyUsers[index];
            values.push([
              task.id,
              user.id,
              "pending",
              new Date()
            ]);
            assignedUserIds.add(user.id); // Mark this user as assigned
          });
        }

        // PRIORITY 2: Assign Mia Khalifia tasks to eligible users only
        if (miaKhalifiaTasks.length > 0 && miaKhalifiaEligibleUsers.length > 0) {
          const shuffledMiaUsers = [...miaKhalifiaEligibleUsers].sort(() => Math.random() - 0.5);
          const miaTasksToAssign = miaKhalifiaTasks.slice(0, shuffledMiaUsers.length);
          
          miaTasksToAssign.forEach((task, index) => {
            const user = shuffledMiaUsers[index];
            values.push([
              task.id,
              user.id,
              "pending",
              new Date()
            ]);
            assignedUserIds.add(user.id); // Mark this user as assigned
          });
        }

        // PRIORITY 3: Assign regular tasks to remaining users (who didn't get special tasks)
        if (regularTasks.length > 0) {
          // Filter out users who already got special tasks
          const availableUsers = users.filter(user => !assignedUserIds.has(user.id));
          
          if (availableUsers.length > 0) {
            const shuffledAvailableUsers = [...availableUsers].sort(() => Math.random() - 0.5);
            const regularTasksToAssign = regularTasks.slice(0, shuffledAvailableUsers.length);
            
            regularTasksToAssign.forEach((task, index) => {
              values.push([
                task.id,
                shuffledAvailableUsers[index].id,
                "pending",
                new Date()
              ]);
            });
          }
        }

        if (values.length === 0) {
          return res.status(200).json({ message: "No tasks assigned", noTasksToAssign: true });
        }

        // Insert only the new assignments
        db.query(
          "INSERT INTO assignments (task_id, roommate_id, status, assigned_date) VALUES ?",
          [values],
          (err3) => {
            if (err3) {
              console.error("POST /api/assign insert error:", err3);
              return res.status(500).json({ error: "Failed to assign tasks", details: err3.code || err3.message });
            }

            const assignedCount = values.length;
            const remainingUnassignedCount = unassignedTasks.length - assignedCount;
            logActivity('assignment', `Randomly assigned ${assignedCount} task${assignedCount > 1 ? 's' : ''} to roommates`, '🎲', req.session.username);
            res.json({
              message: "Assigned",
              assignedCount: assignedCount,
              remainingUnassignedCount
            });
          }
        );
      });
    });
  });
});
// ================= EXPENSE SPLITTING ROUTES =================

// Get all expense groups
app.get("/api/expenses/groups", requireAuth, (req, res) => {
  const query = `
    SELECT
      eg.*,
      u.username as created_by_username,
      u.full_name as created_by_name,
      (SELECT COUNT(DISTINCT e2.id) FROM expenses e2 WHERE e2.group_id = eg.id) as expense_count,
      (SELECT COALESCE(SUM(e3.amount), 0) FROM expenses e3 WHERE e3.group_id = eg.id) as total_amount,
      (SELECT COUNT(DISTINCT egm2.user_id) FROM expense_group_members egm2 WHERE egm2.group_id = eg.id) as member_count
    FROM expense_groups eg
    LEFT JOIN users u ON eg.created_by = u.id
    INNER JOIN expense_group_members egm ON eg.id = egm.group_id
    WHERE egm.user_id = ?
    GROUP BY eg.id, eg.name, eg.description, eg.created_by, eg.created_at, eg.is_settled,
             u.username, u.full_name
    ORDER BY eg.created_at DESC
  `;
  
  db.query(query, [req.session.userId], (err, results) => {
    if (err) {
      console.error("GET /api/expenses/groups error:", err);
      return res.status(500).json({ error: "Failed to fetch expense groups", details: err.message });
    }
    res.json(results);
  });
});

// Create new expense group (Admin only)
app.post("/api/expenses/groups", requireAdmin, (req, res) => {
  const { name, description, memberIds } = req.body;
  
  if (!name) {
    return res.status(400).json({ error: "Group name is required" });
  }

  db.query(
    "INSERT INTO expense_groups (name, description, created_by) VALUES (?, ?, ?)",
    [name, description, req.session.userId],
    (err, result) => {
      if (err) {
        console.error("POST /api/expenses/groups error:", err);
        return res.status(500).json({ error: "Failed to create expense group", details: err.message });
      }

      const groupId = result.insertId;
      
      // Add creator as member
      const members = [req.session.userId, ...(memberIds || [])];
      const uniqueMembers = [...new Set(members)];
      
      const memberValues = uniqueMembers.map(userId => [groupId, userId]);
      
      db.query(
        "INSERT INTO expense_group_members (group_id, user_id) VALUES ?",
        [memberValues],
        (err2) => {
          if (err2) {
            console.error("POST /api/expenses/groups members error:", err2);
            return res.status(500).json({ error: "Failed to add group members", details: err2.message });
          }

          logActivity('expense', `Created expense group "${name}"`, '💰', req.session.username);
          sendTelegramNotification('expense', `💰 ${req.session.username} created expense group "${name}"`, '💰');
          
          res.json({ message: "Expense group created", groupId });
        }
      );
    }
  );
});

// Add members to an expense group (admin only)
app.post("/api/expenses/groups/:id/members", requireAdmin, (req, res) => {
  const { id } = req.params;
  const { memberIds } = req.body;
  
  if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
    return res.status(400).json({ error: "Member IDs are required" });
  }
  
  // Verify user is admin or group creator
  db.query(
    "SELECT created_by FROM expense_groups WHERE id = ?",
    [id],
    (err, groupResult) => {
      if (err || groupResult.length === 0) {
        return res.status(404).json({ error: "Group not found" });
      }
      
      // Get existing members
      db.query(
        "SELECT user_id FROM expense_group_members WHERE group_id = ?",
        [id],
        (err, existingMembers) => {
          if (err) {
            return res.status(500).json({ error: "Failed to check existing members", details: err.message });
          }
          
          const existingMemberIds = existingMembers.map(m => m.user_id);
          
          // Filter out members who are already in the group
          const newMemberIds = memberIds.filter(userId => !existingMemberIds.includes(userId));
          
          if (newMemberIds.length === 0) {
            return res.json({ message: "All selected users are already members", addedCount: 0 });
          }
          
          // Add new members
          const memberValues = newMemberIds.map(userId => [id, userId]);
          
          db.query(
            "INSERT INTO expense_group_members (group_id, user_id) VALUES ?",
            [memberValues],
            (err) => {
              if (err) {
                console.error("POST /api/expenses/groups/:id/members error:", err);
                return res.status(500).json({ error: "Failed to add members", details: err.message });
              }
              
              logActivity('expense', `Added ${newMemberIds.length} member(s) to expense group`, '👥', req.session.username);
              sendTelegramNotification('expense', `👥 ${req.session.username} added ${newMemberIds.length} member(s) to an expense group`, '👥');
              
              res.json({ message: "Members added successfully", addedCount: newMemberIds.length });
            }
          );
        }
      );
    }
  );
});

// Get expense group details with members and expenses
app.get("/api/expenses/groups/:id", requireAuth, (req, res) => {
  const { id } = req.params;
  
  // Check if user is member of this group
  db.query(
    "SELECT * FROM expense_group_members WHERE group_id = ? AND user_id = ?",
    [id, req.session.userId],
    (err, membership) => {
      if (err) {
        return res.status(500).json({ error: "Failed to verify membership", details: err.message });
      }
      
      if (membership.length === 0) {
        return res.status(403).json({ error: "You are not a member of this group" });
      }

      // Get group details
      db.query(
        `SELECT eg.*, u.username as created_by_username, u.full_name as created_by_name
         FROM expense_groups eg
         LEFT JOIN users u ON eg.created_by = u.id
         WHERE eg.id = ?`,
        [id],
        (err, groupResult) => {
          if (err || groupResult.length === 0) {
            return res.status(404).json({ error: "Group not found" });
          }

          // Get members
          db.query(
            `SELECT u.id, u.username, u.full_name, u.photo, egm.joined_at
             FROM expense_group_members egm
             JOIN users u ON egm.user_id = u.id
             WHERE egm.group_id = ?`,
            [id],
            (err, members) => {
              if (err) {
                return res.status(500).json({ error: "Failed to fetch members", details: err.message });
              }

              // Get expenses with splits
              db.query(
                `SELECT e.*, u.username as paid_by_username, u.full_name as paid_by_name
                 FROM expenses e
                 LEFT JOIN users u ON e.paid_by = u.id
                 WHERE e.group_id = ?
                 ORDER BY e.expense_date DESC, e.created_at DESC`,
                [id],
                (err, expenses) => {
                  if (err) {
                    return res.status(500).json({ error: "Failed to fetch expenses", details: err.message });
                  }

                  // Get splits for each expense
                  if (expenses.length === 0) {
                    return res.json({
                      group: groupResult[0],
                      members,
                      expenses
                    });
                  }

                  const expenseIds = expenses.map(e => e.id);
                  db.query(
                    `SELECT es.*, u.username, u.full_name
                     FROM expense_splits es
                     LEFT JOIN users u ON es.user_id = u.id
                     WHERE es.expense_id IN (?)
                     ORDER BY es.expense_id, u.full_name`,
                    [expenseIds],
                    (err, splits) => {
                      if (err) {
                        return res.status(500).json({ error: "Failed to fetch expense splits", details: err.message });
                      }

                      // Attach splits to each expense
                      expenses.forEach(expense => {
                        expense.splits = splits.filter(s => s.expense_id === expense.id);
                      });

                      res.json({
                        group: groupResult[0],
                        members,
                        expenses
                      });
                    }
                  );
                }
              );
            }
          );
        }
      );
    }
  );
});

// Add expense to group
app.post("/api/expenses", requireAuth, upload.single("receipt"), (req, res) => {
  const { groupId, description, amount, splitWith, splitType, customSplits } = req.body;
  
  // Use current date if not provided
  const expenseDate = req.body.expenseDate || new Date().toISOString().split('T')[0];

  // Validate inputs
  if (!description || !amount) {
    return res.status(400).json({ error: "Description and amount are required" });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  // Verify user is member of group
  db.query(
    "SELECT * FROM expense_group_members WHERE group_id = ? AND user_id = ?",
    [groupId, req.session.userId],
    (err, membership) => {
      if (err || membership.length === 0) {
        return res.status(403).json({ error: "You are not a member of this group" });
      }

      // Get a connection for transaction
      db.getConnection((err, connection) => {
        if (err) {
          console.error("Failed to get DB connection:", err);
          return res.status(500).json({ error: "Database connection error", details: err.message });
        }

        // Start transaction
        connection.beginTransaction((err) => {
          if (err) {
            connection.release();
            console.error("Failed to start transaction:", err);
            return res.status(500).json({ error: "Transaction error", details: err.message });
          }

          // Insert expense
          connection.query(
            `INSERT INTO expenses (group_id, description, amount, paid_by, category, expense_date, receipt_photo, notes)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [groupId, description, parsedAmount, req.session.userId, 'general', expenseDate, null, null],
            (err, result) => {
              if (err) {
                return connection.rollback(() => {
                  connection.release();
                  console.error("POST /api/expenses error:", err);
                  res.status(500).json({ error: "Failed to add expense", details: err.message });
                });
              }

              const expenseId = result.insertId;
              
              // Handle custom splits
              if (splitType === 'custom' && customSplits) {
                try {
                  const splits = JSON.parse(customSplits);
                  
                  // Validate custom splits have at least one member
                  if (Object.keys(splits).length === 0) {
                    return connection.rollback(() => {
                      connection.release();
                      res.status(400).json({ error: "At least one member must be selected for custom split" });
                    });
                  }
                  
                  createCustomExpenseSplitsWithTransaction(connection, expenseId, splits, parsedAmount, groupId, description, req, res);
                } catch (e) {
                  return connection.rollback(() => {
                    connection.release();
                    res.status(400).json({ error: "Invalid custom splits format" });
                  });
                }
              } else {
                // Handle equal splits
                let splitMembers = [];
                try {
                  splitMembers = splitWith ? JSON.parse(splitWith) : [];
                } catch (e) {
                  splitMembers = [];
                }

                // If no split members specified, get all group members
                if (splitMembers.length === 0) {
                  connection.query(
                    "SELECT user_id FROM expense_group_members WHERE group_id = ?",
                    [groupId],
                    (err, members) => {
                      if (err) {
                        return connection.rollback(() => {
                          connection.release();
                          res.status(500).json({ error: "Failed to fetch group members", details: err.message });
                        });
                      }
                      
                      splitMembers = members.map(m => m.user_id);
                      
                      if (splitMembers.length === 0) {
                        return connection.rollback(() => {
                          connection.release();
                          res.status(400).json({ error: "No members found in group" });
                        });
                      }
                      
                      createEqualExpenseSplitsWithTransaction(connection, expenseId, splitMembers, parsedAmount, groupId, description, req, res);
                    }
                  );
                } else {
                  // Validate that all split members are actually in the group
                  connection.query(
                    "SELECT user_id FROM expense_group_members WHERE group_id = ? AND user_id IN (?)",
                    [groupId, splitMembers],
                    (err, validMembers) => {
                      if (err) {
                        return connection.rollback(() => {
                          connection.release();
                          res.status(500).json({ error: "Failed to validate split members", details: err.message });
                        });
                      }
                      
                      if (validMembers.length !== splitMembers.length) {
                        return connection.rollback(() => {
                          connection.release();
                          res.status(400).json({ error: "Some selected members are not in this group" });
                        });
                      }
                      
                      createEqualExpenseSplitsWithTransaction(connection, expenseId, splitMembers, parsedAmount, groupId, description, req, res);
                    }
                  );
                }
              }
            }
          );
        });
      });
    }
  );
});

// Helper function to create equal expense splits (legacy - without transaction)
function createEqualExpenseSplits(expenseId, splitMembers, totalAmount, groupId, description, req, res) {
  // Fix floating-point rounding: distribute remainder to last person
  const total = parseFloat(totalAmount);
  const count = splitMembers.length;
  const baseAmount = Math.floor((total * 100) / count) / 100; // Base amount per person in rupees
  const totalBase = baseAmount * count;
  const remainder = Math.round((total - totalBase) * 100) / 100; // Remainder in rupees
  
  const splitValues = splitMembers.map((userId, index) => {
    const amount = index === count - 1
      ? (baseAmount + remainder).toFixed(2) // Last person gets base + remainder
      : baseAmount.toFixed(2);
    return [expenseId, userId, amount];
  });

  db.query(
    "INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES ?",
    [splitValues],
    (err) => {
      if (err) {
        console.error("POST /api/expenses splits error:", err);
        return res.status(500).json({ error: "Failed to create expense splits", details: err.message });
      }

      logActivity('expense', `Added expense "${description}" (₹${totalAmount})`, '💸', req.session.username);
      sendTelegramNotification('expense', `💸 ${req.session.username} added expense "${description}" (₹${totalAmount})`, '💸');
      
      res.json({ message: "Expense added successfully", expenseId });
    }
  );
}

// Helper function to create equal expense splits with transaction
function createEqualExpenseSplitsWithTransaction(connection, expenseId, splitMembers, totalAmount, groupId, description, req, res) {
  // Fix floating-point rounding: distribute remainder to last person
  const total = parseFloat(totalAmount);
  const count = splitMembers.length;
  const baseAmount = Math.floor((total * 100) / count) / 100;
  const totalBase = baseAmount * count;
  const remainder = Math.round((total - totalBase) * 100) / 100;
  
  const splitValues = splitMembers.map((userId, index) => {
    const amount = index === count - 1
      ? (baseAmount + remainder).toFixed(2)
      : baseAmount.toFixed(2);
    return [expenseId, userId, amount];
  });

  connection.query(
    "INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES ?",
    [splitValues],
    (err) => {
      if (err) {
        return connection.rollback(() => {
          connection.release();
          console.error("POST /api/expenses splits error:", err);
          res.status(500).json({ error: "Failed to create expense splits", details: err.message });
        });
      }

      // Commit transaction
      connection.commit((err) => {
        if (err) {
          return connection.rollback(() => {
            connection.release();
            console.error("Transaction commit error:", err);
            res.status(500).json({ error: "Failed to commit transaction", details: err.message });
          });
        }

        connection.release();
        logActivity('expense', `Added expense "${description}" (₹${totalAmount})`, '💸', req.session.username);
        sendTelegramNotification('expense', `💸 ${req.session.username} added expense "${description}" (₹${totalAmount})`, '💸');
        
        res.json({ message: "Expense added successfully", expenseId });
      });
    }
  );
}

// Helper function to create custom expense splits (legacy - without transaction)
function createCustomExpenseSplits(expenseId, customSplits, totalAmount, groupId, description, req, res) {
  // Validate that custom splits sum to total amount (within 1 paisa tolerance)
  const splitTotal = Object.values(customSplits).reduce((sum, amt) => sum + parseFloat(amt), 0);
  const difference = Math.abs(parseFloat(totalAmount) - splitTotal);
  
  if (difference > 0.01) {
    return res.status(400).json({
      error: "Custom split amounts must equal the total expense amount",
      details: `Total: ₹${totalAmount}, Split total: ₹${splitTotal.toFixed(2)}`
    });
  }

  // Validate all amounts are positive
  for (const [userId, amount] of Object.entries(customSplits)) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return res.status(400).json({ error: "All split amounts must be non-negative numbers" });
    }
  }

  const splitUserIds = Object.keys(customSplits).map(id => parseInt(id));
  
  // Validate that all split members are in the group
  db.query(
    "SELECT user_id FROM expense_group_members WHERE group_id = ? AND user_id IN (?)",
    [groupId, splitUserIds],
    (err, validMembers) => {
      if (err) {
        return res.status(500).json({ error: "Failed to validate split members", details: err.message });
      }
      
      if (validMembers.length !== splitUserIds.length) {
        return res.status(400).json({ error: "Some selected members are not in this group" });
      }

      const splitValues = Object.entries(customSplits).map(([userId, amount]) => [
        expenseId,
        parseInt(userId),
        parseFloat(amount).toFixed(2)
      ]);

      db.query(
        "INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES ?",
        [splitValues],
        (err) => {
          if (err) {
            console.error("POST /api/expenses custom splits error:", err);
            return res.status(500).json({ error: "Failed to create expense splits", details: err.message });
          }

          logActivity('expense', `Added expense "${description}" (₹${totalAmount}) with custom splits`, '💸', req.session.username);
          sendTelegramNotification('expense', `💸 ${req.session.username} added expense "${description}" (₹${totalAmount}) with custom splits`, '💸');
          
          res.json({ message: "Expense added successfully", expenseId });
        }
      );
    }
  );
}

// Helper function to create custom expense splits with transaction
function createCustomExpenseSplitsWithTransaction(connection, expenseId, customSplits, totalAmount, groupId, description, req, res) {
  // Validate that custom splits sum to total amount (within 1 paisa tolerance)
  const splitTotal = Object.values(customSplits).reduce((sum, amt) => sum + parseFloat(amt), 0);
  const difference = Math.abs(parseFloat(totalAmount) - splitTotal);
  
  if (difference > 0.01) {
    return connection.rollback(() => {
      connection.release();
      res.status(400).json({
        error: "Custom split amounts must equal the total expense amount",
        details: `Total: ₹${totalAmount}, Split total: ₹${splitTotal.toFixed(2)}`
      });
    });
  }

  // Validate all amounts are positive
  for (const [userId, amount] of Object.entries(customSplits)) {
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount < 0) {
      return connection.rollback(() => {
        connection.release();
        res.status(400).json({ error: "All split amounts must be non-negative numbers" });
      });
    }
  }

  const splitUserIds = Object.keys(customSplits).map(id => parseInt(id));
  
  // Validate that all split members are in the group
  connection.query(
    "SELECT user_id FROM expense_group_members WHERE group_id = ? AND user_id IN (?)",
    [groupId, splitUserIds],
    (err, validMembers) => {
      if (err) {
        return connection.rollback(() => {
          connection.release();
          res.status(500).json({ error: "Failed to validate split members", details: err.message });
        });
      }
      
      if (validMembers.length !== splitUserIds.length) {
        return connection.rollback(() => {
          connection.release();
          res.status(400).json({ error: "Some selected members are not in this group" });
        });
      }

      const splitValues = Object.entries(customSplits).map(([userId, amount]) => [
        expenseId,
        parseInt(userId),
        parseFloat(amount).toFixed(2)
      ]);

      connection.query(
        "INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES ?",
        [splitValues],
        (err) => {
          if (err) {
            return connection.rollback(() => {
              connection.release();
              console.error("POST /api/expenses custom splits error:", err);
              res.status(500).json({ error: "Failed to create expense splits", details: err.message });
            });
          }

          // Commit transaction
          connection.commit((err) => {
            if (err) {
              return connection.rollback(() => {
                connection.release();
                console.error("Transaction commit error:", err);
                res.status(500).json({ error: "Failed to commit transaction", details: err.message });
              });
            }

            connection.release();
            logActivity('expense', `Added expense "${description}" (₹${totalAmount}) with custom splits`, '💸', req.session.username);
            sendTelegramNotification('expense', `💸 ${req.session.username} added expense "${description}" (₹${totalAmount}) with custom splits`, '💸');
            
            res.json({ message: "Expense added successfully", expenseId });
          });
        }
      );
    }
  );
}

// Get balance summary for a group
app.get("/api/expenses/groups/:id/balance", requireAuth, (req, res) => {
  const { id } = req.params;

  // Verify membership
  db.query(
    "SELECT * FROM expense_group_members WHERE group_id = ? AND user_id = ?",
    [id, req.session.userId],
    (err, membership) => {
      if (err || membership.length === 0) {
        return res.status(403).json({ error: "You are not a member of this group" });
      }

      // Calculate balances including settlements using subqueries to avoid cross-multiplication
      // Balance = (What I paid) - (What I owe) - (What I received in settlements) + (What I paid in settlements)
      // Positive balance = I'm owed money
      // Negative balance = I owe money
      const query = `
        SELECT
          u.id,
          u.username,
          u.full_name,
          u.photo,
          (SELECT COALESCE(SUM(e.amount), 0)
           FROM expenses e
           WHERE e.group_id = ? AND e.paid_by = u.id) as total_paid,
          (SELECT COALESCE(SUM(es.share_amount), 0)
           FROM expense_splits es
           WHERE es.user_id = u.id
           AND es.expense_id IN (SELECT id FROM expenses WHERE group_id = ?)) as total_share,
          (SELECT COALESCE(SUM(s.amount), 0)
           FROM settlements s
           WHERE s.group_id = ? AND s.from_user_id = u.id) as total_paid_settlements,
          (SELECT COALESCE(SUM(s.amount), 0)
           FROM settlements s
           WHERE s.group_id = ? AND s.to_user_id = u.id) as total_received_settlements,
          ((SELECT COALESCE(SUM(e.amount), 0)
            FROM expenses e
            WHERE e.group_id = ? AND e.paid_by = u.id) -
           (SELECT COALESCE(SUM(es.share_amount), 0)
            FROM expense_splits es
            WHERE es.user_id = u.id
            AND es.expense_id IN (SELECT id FROM expenses WHERE group_id = ?)) -
           (SELECT COALESCE(SUM(s.amount), 0)
            FROM settlements s
            WHERE s.group_id = ? AND s.to_user_id = u.id) +
           (SELECT COALESCE(SUM(s.amount), 0)
            FROM settlements s
            WHERE s.group_id = ? AND s.from_user_id = u.id)) as balance
        FROM expense_group_members egm
        JOIN users u ON egm.user_id = u.id
        WHERE egm.group_id = ?
        ORDER BY balance DESC
      `;

      db.query(query, [id, id, id, id, id, id, id, id, id], (err, balances) => {
        if (err) {
          console.error("GET /api/expenses/groups/:id/balance error:", err);
          return res.status(500).json({ error: "Failed to calculate balances", details: err.message });
        }

        // Calculate simplified settlements (who owes whom) based on current balances
        const settlements = calculateSettlements(balances);

        res.json({ balances, settlements });
      });
    }
  );
});

// Helper function to calculate optimal settlements
function calculateSettlements(balances) {
  const creditors = balances.filter(b => parseFloat(b.balance) > 0.01).sort((a, b) => b.balance - a.balance);
  const debtors = balances.filter(b => parseFloat(b.balance) < -0.01).sort((a, b) => a.balance - b.balance);
  
  const settlements = [];
  let i = 0, j = 0;

  while (i < creditors.length && j < debtors.length) {
    const creditor = creditors[i];
    const debtor = debtors[j];
    
    const amount = Math.min(
      parseFloat(creditor.balance),
      Math.abs(parseFloat(debtor.balance))
    );

    if (amount > 0.01) {
      settlements.push({
        from_user_id: debtor.id,
        from_user_name: debtor.full_name || debtor.username,
        to_user_id: creditor.id,
        to_user_name: creditor.full_name || creditor.username,
        amount: amount.toFixed(2)
      });
    }

    creditor.balance = (parseFloat(creditor.balance) - amount).toFixed(2);
    debtor.balance = (parseFloat(debtor.balance) + amount).toFixed(2);

    if (Math.abs(parseFloat(creditor.balance)) < 0.01) i++;
    if (Math.abs(parseFloat(debtor.balance)) < 0.01) j++;
  }

  return settlements;
}

// Record a settlement
app.post("/api/expenses/settlements", requireAuth, (req, res) => {
  const { groupId, fromUserId, amount, notes } = req.body;

  if (!groupId || !fromUserId || !amount) {
    return res.status(400).json({ error: "Group ID, payer, and amount are required" });
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    return res.status(400).json({ error: "Amount must be a positive number" });
  }

  // Current user (req.session.userId) is the receiver confirming payment from fromUserId
  const toUserId = req.session.userId;

  // Verify membership
  db.query(
    "SELECT * FROM expense_group_members WHERE group_id = ? AND user_id IN (?, ?)",
    [groupId, fromUserId, toUserId],
    (err, membership) => {
      if (err || membership.length < 2) {
        return res.status(403).json({ error: "Both users must be members of this group" });
      }

      // Calculate current balances to validate settlement amount
      const balanceQuery = `
        SELECT
          u.id,
          u.username,
          u.full_name,
          ((SELECT COALESCE(SUM(e.amount), 0)
            FROM expenses e
            WHERE e.group_id = ? AND e.paid_by = u.id) -
           (SELECT COALESCE(SUM(es.share_amount), 0)
            FROM expense_splits es
            WHERE es.user_id = u.id
            AND es.expense_id IN (SELECT id FROM expenses WHERE group_id = ?)) -
           (SELECT COALESCE(SUM(s.amount), 0)
            FROM settlements s
            WHERE s.group_id = ? AND s.to_user_id = u.id) +
           (SELECT COALESCE(SUM(s.amount), 0)
            FROM settlements s
            WHERE s.group_id = ? AND s.from_user_id = u.id)) as balance
        FROM expense_group_members egm
        JOIN users u ON egm.user_id = u.id
        WHERE egm.group_id = ? AND u.id IN (?, ?)
      `;

      db.query(balanceQuery, [groupId, groupId, groupId, groupId, groupId, fromUserId, toUserId], (err, balances) => {
        if (err) {
          console.error("Failed to calculate balances for settlement validation:", err);
          return res.status(500).json({ error: "Failed to validate settlement", details: err.message });
        }

        // Calculate suggested settlements using the same algorithm
        const creditors = balances.filter(b => parseFloat(b.balance) > 0.01).sort((a, b) => b.balance - a.balance);
        const debtors = balances.filter(b => parseFloat(b.balance) < -0.01).sort((a, b) => a.balance - b.balance);
        
        const settlements = [];
        let i = 0, j = 0;

        while (i < creditors.length && j < debtors.length) {
          const creditor = creditors[i];
          const debtor = debtors[j];
          
          const suggestedAmount = Math.min(
            parseFloat(creditor.balance),
            Math.abs(parseFloat(debtor.balance))
          );

          if (suggestedAmount > 0.01) {
            settlements.push({
              from_user_id: debtor.id,
              to_user_id: creditor.id,
              amount: suggestedAmount
            });
          }

          creditor.balance = (parseFloat(creditor.balance) - suggestedAmount).toFixed(2);
          debtor.balance = (parseFloat(debtor.balance) + suggestedAmount).toFixed(2);

          if (Math.abs(parseFloat(creditor.balance)) < 0.01) i++;
          if (Math.abs(parseFloat(debtor.balance)) < 0.01) j++;
        }

        // Find the suggested settlement for this pair
        const suggestedSettlement = settlements.find(
          s => s.from_user_id === fromUserId && s.to_user_id === toUserId
        );

        if (!suggestedSettlement) {
          return res.status(400).json({
            error: "No settlement needed between these users",
            details: "The current balances don't suggest a payment from this user to you. Please refresh and check the latest balances."
          });
        }

        // Validate amount is within acceptable range (allow up to 10% variance or ₹10, whichever is larger)
        const suggestedAmt = parseFloat(suggestedSettlement.amount);
        const maxVariance = Math.max(suggestedAmt * 0.1, 10);
        const difference = Math.abs(parsedAmount - suggestedAmt);

        if (difference > maxVariance) {
          return res.status(400).json({
            error: "Settlement amount doesn't match suggested amount",
            details: `Suggested amount: ₹${suggestedAmt.toFixed(2)}, Your amount: ₹${parsedAmount.toFixed(2)}. Difference: ₹${difference.toFixed(2)}`,
            suggestedAmount: suggestedAmt.toFixed(2)
          });
        }

        // If validation passes, record the settlement
        db.query(
          `INSERT INTO settlements (group_id, from_user_id, to_user_id, amount, notes)
           VALUES (?, ?, ?, ?, ?)`,
          [groupId, fromUserId, toUserId, parsedAmount, notes],
          (err, result) => {
            if (err) {
              console.error("POST /api/expenses/settlements error:", err);
              return res.status(500).json({ error: "Failed to record settlement", details: err.message });
            }

            // Get user names for notification
            db.query(
              "SELECT id, full_name, username FROM users WHERE id IN (?, ?)",
              [fromUserId, toUserId],
              (err, users) => {
                const fromUser = users.find(u => u.id === fromUserId);
                const toUser = users.find(u => u.id === toUserId);
                
                logActivity('settlement', `${toUser.full_name || toUser.username} confirmed receiving ₹${parsedAmount} from ${fromUser.full_name || fromUser.username}`, '💳', req.session.username);
                sendTelegramNotification('settlement', `💳 ${fromUser.full_name || fromUser.username} paid ₹${parsedAmount} to ${toUser.full_name || toUser.username}`, '💳');
                
                res.json({ message: "Settlement recorded successfully", settlementId: result.insertId });
              }
            );
          }
        );
      });
    }
  );
});

// Get settlement history for a group
app.get("/api/expenses/groups/:id/settlements", requireAuth, (req, res) => {
  const { id } = req.params;

  db.query(
    "SELECT * FROM expense_group_members WHERE group_id = ? AND user_id = ?",
    [id, req.session.userId],
    (err, membership) => {
      if (err || membership.length === 0) {
        return res.status(403).json({ error: "You are not a member of this group" });
      }

      db.query(
        `SELECT 
          s.*,
          u1.username as from_username,
          u1.full_name as from_name,
          u2.username as to_username,
          u2.full_name as to_name
         FROM settlements s
         JOIN users u1 ON s.from_user_id = u1.id
         JOIN users u2 ON s.to_user_id = u2.id
         WHERE s.group_id = ?
         ORDER BY s.settlement_date DESC`,
        [id],
        (err, settlements) => {
          if (err) {
            console.error("GET /api/expenses/groups/:id/settlements error:", err);
            return res.status(500).json({ error: "Failed to fetch settlements", details: err.message });
          }
          res.json(settlements);
        }
      );
    }
  );
});

// Delete expense
app.delete("/api/expenses/:id", requireAuth, (req, res) => {
  const { id } = req.params;

  // Check if user created the expense or is admin
  db.query(
    "SELECT e.*, eg.created_by as group_creator FROM expenses e JOIN expense_groups eg ON e.group_id = eg.id WHERE e.id = ?",
    [id],
    (err, result) => {
      if (err || result.length === 0) {
        return res.status(404).json({ error: "Expense not found" });
      }

      const expense = result[0];
      
      // Check if user has permission (creator of expense, group creator, or admin)
      db.query(
        "SELECT role FROM users WHERE id = ?",
        [req.session.userId],
        (err, userResult) => {
          if (err) {
            return res.status(500).json({ error: "Failed to verify permissions" });
          }

          const isAdmin = userResult[0].role === 'admin';
          const isExpenseCreator = expense.paid_by === req.session.userId;
          const isGroupCreator = expense.group_creator === req.session.userId;

          if (!isAdmin && !isExpenseCreator && !isGroupCreator) {
            return res.status(403).json({ error: "You don't have permission to delete this expense" });
          }

          // Delete expense splits first
          db.query("DELETE FROM expense_splits WHERE expense_id = ?", [id], (err) => {
            if (err) {
              return res.status(500).json({ error: "Failed to delete expense splits", details: err.message });
            }

            // Delete expense
            db.query("DELETE FROM expenses WHERE id = ?", [id], (err) => {
              if (err) {
                return res.status(500).json({ error: "Failed to delete expense", details: err.message });
              }

              logActivity('expense', `Deleted expense "${expense.description}"`, '🗑️', req.session.username);
              res.json({ message: "Expense deleted successfully" });
            });
          });
        }
      );
    }
  );
});

// Mark group as settled
app.put("/api/expenses/groups/:id/settle", requireAuth, (req, res) => {
  const { id } = req.params;

  // Check if user is group creator or admin
  db.query(
    "SELECT created_by FROM expense_groups WHERE id = ?",
    [id],
    (err, result) => {
      if (err || result.length === 0) {
        return res.status(404).json({ error: "Group not found" });
      }

      db.query(
        "SELECT role FROM users WHERE id = ?",
        [req.session.userId],
        (err, userResult) => {
          if (err) {
            return res.status(500).json({ error: "Failed to verify permissions" });
          }

          const isAdmin = userResult[0].role === 'admin';
          const isCreator = result[0].created_by === req.session.userId;

          if (!isAdmin && !isCreator) {
            return res.status(403).json({ error: "Only group creator or admin can settle the group" });
          }

          db.query(
            "UPDATE expense_groups SET is_settled = 1 WHERE id = ?",
            [id],
            (err) => {
              if (err) {
                return res.status(500).json({ error: "Failed to settle group", details: err.message });
              }

              logActivity('expense', `Settled expense group`, '✅', req.session.username);
              res.json({ message: "Group marked as settled" });
            }
          );
        }
      );
    }
  );
});

// Get expense categories
app.get("/api/expenses/categories", requireAuth, (req, res) => {
  const categories = [
    { value: 'food', label: '🍔 Food & Dining', icon: '🍔' },
    { value: 'groceries', label: '🛒 Groceries', icon: '🛒' },
    { value: 'transport', label: '🚗 Transportation', icon: '🚗' },
    { value: 'utilities', label: '💡 Utilities', icon: '💡' },
    { value: 'rent', label: '🏠 Rent', icon: '🏠' },
    { value: 'entertainment', label: '🎬 Entertainment', icon: '🎬' },
    { value: 'shopping', label: '🛍️ Shopping', icon: '🛍️' },
    { value: 'health', label: '⚕️ Health', icon: '⚕️' },
    { value: 'travel', label: '✈️ Travel', icon: '✈️' },
    { value: 'general', label: '📝 General', icon: '📝' }
  ];
  res.json(categories);
});


// Start server
app.listen(3000, () => {
  console.log("Backend running on port 3000 🚀");
});

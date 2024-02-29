const express = require("express");
const { Pool } = require("pg");
const morgan = require("morgan");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const session = require("express-session");
const nodemailer = require("nodemailer");
const app = express();
const port = 3000;

const pool = new Pool({
  user: "postgres",
  host: "127.0.0.1",
  database: "social-media",
  password: "asdfghjkl;'",
  port: 5432,
});

app.use(morgan("dev"));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(session({ secret: "secret", resave: true, saveUninitialized: true }));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/public/index.html");
});

app.post("/register", async (req, res) => {
  const { username, email, password } = req.body;
  const hashedPassword = await bcrypt.hash(password, 10);

  const query =
    "INSERT INTO users (username, email, password, role, followers, following) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *";
  const values = [
    username,
    email,
    hashedPassword,
    "user",
    [],
    [49, 61, 62, 63, 64, 65],
  ];

  try {
    const result = await pool.query(query, values);
    const user = result.rows[0];

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).send("Error registering user");
  }
});


app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  const query = "SELECT * FROM users WHERE username = $1";
  const values = [username];

  try {
    const result = await pool.query(query, values);
    if (result.rows.length === 0) {
      return res.status(404).send("User not found");
    }

    const user = result.rows[0];
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (isPasswordValid) {
      // Set userId in the session after successful login
      req.session.userId = user.id;

      req.session.role = user.role;

      if (user.role === "admin") {
        res.redirect("/admin");
      } else if (user.role === "user") {
        res.redirect("/user");
      }
    } else {
      return res.status(401).send("Invalid password");
    }
  } catch (error) {
    console.error(error);
    res.status(500).send("Error logging in");
  }
});

app.post("/logout", (req, res) => {
  // Destroy the session
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
      return res.status(500).json({ error: "Error logging out" });
    }
    // Redirect the user to the login page or any other appropriate page after logout
    res.redirect("/");
  });
});
app.get('/followers/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const { rows } = await pool.query('SELECT u.* FROM users u JOIN followers f ON u.id = f.user_id WHERE f.user_id = $1', [userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching followers:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/following/:userId', async (req, res) => {
  const userId = req.params.userId;
  try {
    const { rows } = await pool.query('SELECT u.* FROM users u JOIN following f ON u.id = f.user_id WHERE f.user_id = $1', [userId]);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching following:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Follow user
app.post("/follow/:userId", async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.session.userId;

  try {
    // Check if the user is trying to follow themselves
    const isUserTryingToFollowThemselves = currentUserId === userId;
    if (isUserTryingToFollowThemselves) {
      return res.status(400).json({ error: "Cannot follow yourself" });
    }

    // Check if the user to follow exists
    const userToFollow = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    if (userToFollow.rows.length === 0) {
      return res.status(404).json({ error: "User to follow not found" });
    }

    // Check if the user is already following the target user
    const isAlreadyFollowing =
      userToFollow.rows[0].followers.includes(currentUserId);
    if (isAlreadyFollowing) {
      return res.status(400).json({ error: "User is already being followed" });
    }

    // Update the followers of the target user
    await pool.query(
      "UPDATE users SET followers = array_append(followers, $1) WHERE id = $2",
      [currentUserId, userId]
    );

    // Update the following of the current user
    await pool.query(
      "UPDATE users SET following = array_append(following, $1) WHERE id = $2",
      [userId, currentUserId]
    );

    res.json({ message: "User followed successfully" });
  } catch (error) {
    console.error("Error following user:", error);
    res.status(500).json({ error: "Error following user" });
  }
});
// Unfollow user
app.post("/unfollow/:userId", async (req, res) => {
  const { userId } = req.params;
  const currentUserId = req.session.userId;

  try {
    // Check if the user to unfollow exists
    const userToUnfollow = await pool.query(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );
    if (userToUnfollow.rows.length === 0) {
      return res.status(404).json({ error: "User to unfollow not found" });
    }

    // Check if the user is not following the target user
    const isNotFollowing =
      !userToUnfollow.rows[0].followers.includes(currentUserId);
    if (isNotFollowing) {
      return res.status(400).json({ error: "User is not being followed" });
    }
    const isUserTryingToFollowThemselves = currentUserId === userId;
    if (isUserTryingToFollowThemselves) {
      return res.status(400).json({ error: "Cannot follow yourself" });
    }

    // Update the followers of the target user
    await pool.query(
      "UPDATE users SET followers = array_remove(followers, $1) WHERE id = $2",
      [currentUserId, userId]
    );

    // Update the following of the current user
    await pool.query(
      "UPDATE users SET following = array_remove(following, $1) WHERE id = $2",
      [userId, currentUserId]
    );

    res.json({ message: "User unfollowed successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error unfollowing user" });
  }
});

app.get("/profile", async (req, res) => {
  try {
    const userId = req.session.userId;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const userResult = await pool.query("SELECT * FROM users WHERE id = $1", [
      userId,
    ]);
    const postsResult = await pool.query(
      "SELECT * FROM posts WHERE user_id = $1",
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = userResult.rows[0];
    const userFollowing = user.following || [];
    const userFollowers = user.followers || [];

    res.json({
      id: user.id,
      username: user.username,
      email: user.email,
      followers: userFollowers.length,
      following: userFollowing.length,
      followingList: userFollowing,
      followersList: userFollowers,
      posts: postsResult.rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error retrieving user profile" });
  }
});
app.post("/post", async (req, res) => {
  try {
    const userId = req.session.userId;
    const { content } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await pool.query(
      "INSERT INTO posts (user_id, content) VALUES ($1, $2) RETURNING *",
      [userId, content]
    );
    const post = result.rows[0];

    res.json(post);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error creating post" });
  }
});

// Fetch all posts for a user
app.get("/posts", async (req, res) => {
  try {
    const postsResult = await pool.query("SELECT * FROM posts");
    const posts = postsResult.rows;

    res.json(posts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching posts" });
  }
});

// Add this endpoint in your server code
app.get("/users", async (req, res) => {
  try {
    const userId = req.session.userId;
    const usersResult = await pool.query(
      "SELECT id, username FROM users WHERE id != $1",
      [userId]
    );

    // Fetch the followers and following of the logged-in user
    const userResult = await pool.query(
      "SELECT followers, following FROM users WHERE id = $1",
      [userId]
    );
    const { followers, following } = userResult.rows[0];

    // Add isFollowing property to each user
    const users = usersResult.rows.map((user) => ({
      id: user.id,
      username: user.username,
      isFollowing: following.includes(user.id),
    }));

    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching users" });
  }
});



app.put("/update-user", async (req, res) => {
  try {
    const userId = req.session.userId; // Assuming you have session management middleware to retrieve userId
    const { username, email, password } = req.body;
    const hashedPassword = await bcrypt.hash(password, 10);


    // Perform validation if necessary

    // Update user data in the database
    await pool.query(
      "UPDATE users SET username = $1, email = $2, password = $3 WHERE id = $4",
      [username, email, hashedPassword, userId]
    );

    res.json({ message: "User data updated successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error updating user data" });
  }
});

app.delete("/delete-account", async (req, res) => {
  try {
    const userId = req.session.userId; // Assuming you have session management middleware to retrieve userId

    // Delete user data from the database
    await pool.query("DELETE FROM users WHERE id = $1", [userId]);

    // Optionally, you may want to delete associated data such as posts, comments, etc.

    res.json({ message: "Account deleted successfully" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error deleting account" });
  }
});



// Add this endpoint in your server code
app.get("/admin/users", async (req, res) => {
  try {
    const usersResult = await pool.query(
      "SELECT id, username, followers, following FROM users"
    );
    const users = usersResult.rows;
    res.json(users);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Error fetching users for admin" });
  }
});

const checkUserRole = (req, res, next) => {
  const role = req.session.role;
  const path = req.path;

  if (!role) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (role === "admin") {
    return next();
  }

  if (role === "user" && path.includes("admin")) {
    return res.status(403).json({ error: "Access denied" });
  }

  next();
};

app.get("/admin", checkUserRole, (req, res) => {
  res.sendFile(__dirname + "/public/admin.html");
});

app.get("/user", checkUserRole, (req, res) => {
  res.sendFile(__dirname + "/public/user.html");
});

app.use(express.static("public"));

app.use((req, res) => {
  res.status(404).json({ error: "Page not found" });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

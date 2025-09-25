const bcrypt = require('bcrypt')
const cookieParser = require('cookie-parser')
// to access the environment variable
require("dotenv").config()
const sanitizeHTML = require("sanitize-html")
const jwt = require('jsonwebtoken')
const express = require('express');
const db = require("better-sqlite3")("myApp.db")
db.pragma("foreign_keys = ON");
db.pragma("journal_mode = WAL")
const app = express();
const port = 4004;



// to enable ejs as view page
app.set("view engine", "ejs")
// To access users  detail at /register  url
app.use(express.urlencoded({ extended: false }))
// To acess global styles file.
app.use(express.static("public"))
app.use(cookieParser())

// database setup here by creating the schemal
const createTables  = db.transaction(() => {
    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username STRING NOT NULL UNIQUE,
        password STRING NOT NULL 
        )
        `
    ).run()

    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        createdDate TEXT,
        title STRING NOT NULL,
        body TEXT NOT NULL,
        authorid INTEGER,
        FOREIGN KEY (authorid) REFERENCES users (id)
         )
        `
    ).run()
   
})


// database setup ends here.



// To create some functions as Global  through middle ware
app.use(function (req, res, next) {
    res.locals.errors = [];

    try {
        const decoded = jwt.verify(req.cookies.myBackendApp, process.env.JWTSECRET);
        req.user = decoded;

        // Validate user exists in the database
        const userStatement = db.prepare("SELECT id FROM users WHERE id = ?");
        const user = userStatement.get(req.user.userId);
        if (!user) {
            req.user = false;
        }
    } catch (err) {
        req.user = false;
    }

    res.locals.user = req.user;
    next();
});

//creating API end point {get to visit // post to update}
// using the return keyword will prevent the further executions of the function
app.get("/", (req, res) => {

    if (req.user) {
        const postStatement = db.prepare("SELECT * FROM posts WHERE authorid = ? ORDER BY createdDate DESC")
        const posts = postStatement.all(req.user.userId)
         return res.render("dashboard", { posts })
    }

    res.render("homepage")
});

app.get("/login", (req, res) => {
    res.render("login")
});

// to check if userrs is login
function checkIflogin(req, res, next) {
    if (req.user) {
        return next()
    }
    res.redirect("/")
    next()
}

app.get("/create", checkIflogin, (req, res) => {
    res.render("create-post")
});

function sharePostValidation(req) {
    const errors = []

    if (typeof req.body.title !== "string") req.body.title = "";
    if (typeof req.body.body !== "string") req.body.body = "";

    //to trim - sanitize or strinnp out html
    req.body.title = sanitizeHTML(req.body.title.trim(), {allowedTags: [], allowedAtributes: {}})
    req.body.body = sanitizeHTML(req.body.body.trim(), {allowedTags: [], allowedAtributes: {}})

    if (!req.body.title) errors.push("You must provide a title")
    if (!req.body.body) errors.push("You must provide a content")

    return errors
}
app.get("/edit-post/:id", checkIflogin, (req,res) =>{
    // try to look up post in question
    const statement = db.prepare("SELECT * FROM posts WHERE id = ?")
    const post = statement.get(req.params.id)

    if (!post) {
        return res.redirect("/")
    }
    // if user not the author, then redirect to homepage
    if (post.authorid !== req.user.userId) {
        return res.redirect("/")
    }

    // otherwise, render the edit post template
    res.render("edit-post", {post})
})

app.post("/edit-post/:id",checkIflogin ,(req,res) =>{
    // try to look up post in question
    const statement = db.prepare("SELECT * FROM posts WHERE id = ?")
    const post = statement.get(req.params.id)

    if (!post) {
        return res.redirect("/")
    }
    // if user not the author, then redirect to homepage
    if (post.authorid !== req.user.userId) {
        return res.redirect("/")
    }

    const errors = sharePostValidation(req)

    if (errors.length) {
        return res.render("edit-post", {errors})
    }
// to save updated post to db
    const updateStatement = db.prepare("UPDATE posts SET title = ?, body = ? WHERE id = ?")
    updateStatement.run(req.body.title, req.body.body, req.params.id)
     
    res.redirect(`/post/${req.params.id}`)
})

app.post("/delete-post/:id",checkIflogin,(req,res) => {
 // try to look up post in question
 const statement = db.prepare("SELECT * FROM posts WHERE id = ?")
 const post = statement.get(req.params.id)

 if (!post) {
     return res.redirect("/")
 }
 // if user not the author, then redirect to homepage
 if (post.authorid !== req.user.userId) {
     return res.redirect("/")
 }

  
// to save updated post to db
 const deleteStatement = db.prepare("DELETE FROM posts WHERE id = ?")
 deleteStatement.run( req.params.id)

 res.redirect("/")

})


// dynamic route path
app.get("/post/:id", (req, res) => {
    console.log("Request URL:", req.url);
    console.log("Request ID:", req.params.id);

    const id = parseInt(req.params.id, 10);

    const statement = db.prepare("SELECT posts.*, users.username FROM posts JOIN users ON posts.authorid = users.id WHERE posts.id = ?");
    const post = statement.get(id);
 
    if (!post) {
         return res.redirect("/");
    }

    const isAuthor = post.authorid === req.user.userId

     res.render("posts", { post, isAuthor });
});

// create post request
app.post("/create", checkIflogin, (req, res) => {
    console.log("User ID:", req.user.userId);
    console.log("Request Body:", req.body);
    const errors = sharePostValidation(req)

    // to display errors if exist
    if (errors.length) {
        return res.render("create-post", { errors })
    }

    //to confirm users before inserting to db
    const userStatement = db.prepare("SELECT id FROM users WHERE id = ?");
    const user = userStatement.get(req.user.userId);
    if (!user) {
        return res.status(400).send("Invalid user ID");
    }

    // save into db
    const ourStatement = db.prepare("INSERT INTO posts (title, body, authorid, createdDate) VALUES (?, ?, ?, ?)")
    const result = ourStatement.run(req.body.title, req.body.body, req.user.userId, new Date().toISOString())
 
    // to get the id from the db
    const getUsersPostStatement = db.prepare("SELECT * FROM posts WHERE ROWID = ?")
    const individualPost = getUsersPostStatement.get(result.lastInsertRowid)

    return res.redirect(`/post/${individualPost.id}`);

});

app.get("/logout", (req, res) => {
    res.clearCookie("myBackendApp");
    res.redirect("/")
})

// Set Validation Rule for users details
app.post("/login", (req, res) => {
    let errors = [];

    if (typeof req.body.username !== "string") req.body.username = "";
    if (typeof req.body.password !== "string") req.body.password = "";

    if (req.body.username.trim() == "") errors = ["Invalid username/password."]
    if (req.body.password.trim() == "") errors = ["Invalid username/password."]

    if (errors.length) {
        return res.render("login", { errors })
    }

    //To confirm the username by comparing their details
    const userInQuestionStatement = db.prepare("SELECT * FROM users WHERE USERNAME = ?")
    const userInQuestion = userInQuestionStatement.get(req.body.username)
    if (!userInQuestion) {
        const errors = ["Invalid username/password."]
        return res.render("login", { errors })
    }

    // to compare users input details with db
    const matchOrNot = bcrypt.compare(req.body.password, userInQuestion.password)

    if (!matchOrNot) {
        const errors = ["Invalid username/password."]
        return res.render("login", { errors })
    }

    //Give the user a cookie
    const tokenValue = jwt.sign({ exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, skyColor: "blue", userId: userInQuestion.id, username: userInQuestion.username },
        process.env.JWTSECRET)

    res.cookie("myBackendApp", tokenValue, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 24
    })
    res.redirect("/")
})

// Set Validation Rule for users details
app.post("/register", (req, res) => {
    const errors = [];

    if (typeof req.body.username !== "string") req.body.username = "";
    if (typeof req.body.password !== "string") req.body.password = "";

    req.body.username = req.body.username.trim()

    if (!req.body.username) errors.push("You must provide a username.")
    if (req.body.username && req.body.username.length < 3) errors.push("Username must be at least 3 characters.")
    if (req.body.username && req.body.username.length > 10) errors.push("Username can not exceed 10 characters.")
    if (req.body.username && !req.body.username.match(/^[A-za-z0-9]+$/)) errors.push("Username can only contain letters and numbers")

    // to check if users name already exist
    const usernameStatement = db.prepare("SELECT * FROM users WHERE username = ?")
    const usernameCheck = usernameStatement.get(req.body.username)

    if (usernameCheck) errors.push("Username Already Exist")
    // Validating password
    if (!req.body.password) errors.push("You must provide a Password.")
    if (req.body.password && req.body.password.length < 8) errors.push("Password must be at least 8 characters.")
    if (req.body.password && req.body.password.length > 70) errors.push("Password can not exceed 70 characters.")

    if (errors.length) {
        return res.render("homepage", { errors })
    }

    // to hash our users password before install it to the db
    const salt = bcrypt.genSaltSync(10)
    req.body.password = bcrypt.hashSync(req.body.password, salt)

    // save the new users to database using sqlite3
    const dbStatement = db.prepare("INSERT INTO users (username, password) VALUES (?, ?)")
    const result = dbStatement.run(req.body.username, req.body.password)

    // to get users Id from the db to create token
    const lookupSatement = db.prepare("SELECT * FROM users WHERE ROWID = ?")
    const ourUser = lookupSatement.get(result.lastInsertRowid)
 

    //log the users in by giving  a cokies so it automatically log to user loging page
    // cokie accept 3 argument jwt.sign(a,b,c)
    const tokenValue = jwt.sign({ exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24, skyColor: "blue", userId: ourUser.id, username: ourUser.username }, process.env.JWTSECRET)

    res.cookie("myBackendApp", tokenValue, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 24
    })
    res.redirect("/")
})
 
app.listen(port, () => {
    createTables()
    console.log('connect to db')
    console.log(`Server start on http://localhost:${port}`)
});
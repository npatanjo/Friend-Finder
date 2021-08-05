/*
    AUTHORS: Nate Patanjo, Nick Marquis
    FILE: server.js
    ASSIGNMENT: Final Project
    COURSE: CSc 337; Summer 2021
    PURPOSE: 
*/

const express = require('express');
const mongoose = require('mongoose');
const parser = require('body-parser');
const cookieParser = require('cookie-parser');
const crypto = require ("crypto");

const app = express();
app.use(parser.json());
app.use(parser.urlencoded({ extended: true }));
app.use(cookieParser());

const db = mongoose.connection;
const mongoDBURL = 'mongodb://localhost/auto';
const iterations = 1000;

var Schema = mongoose.Schema;

var UserSchema = new Schema ({
    username : String,
    salt : String, 
    hash: String,
    fullName : String,
    photo : String,
    age : String,
    location : String,
    bio : String,
    interests : [{type: Schema.ObjectId, ref: "Interests"}],
    messages : [{type: Schema.ObjectId, ref: "Messages"}]
});

var MessagesSchema = new Schema ({
    toID : String,
    fromID : String,
    messages : String,
});

var InterestsSchema = new Schema ({
    interest : String,
    weight: Number
});

var User = mongoose.model("User", UserSchema);
var Messages = mongoose.model("Messages", MessagesSchema);
var Interests = mongoose.model("Interests", InterestsSchema);
var sessionKeys = {};

app.use("/home.html", authentication);
app.use("/userProfile.html", authentication);
app.use("/", express.static('public_html'))

mongoose.connect(mongoDBURL , { useNewUrlParser: true });
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

function updateSessions() {
  console.log('session update function');
  let now = Date.now();
  for (e in sessionKeys) {
    if (sessionKeys[e][1] < (now - 20000)) {
      delete sessionKeys[e];
    }
  }
}

setInterval(updateSessions, 2000);

function authentication(req, res, next) {
    if (Object.keys(req.cookies).length > 0) {
      let u = req.cookies.login.username;
      let key = req.cookies.login.key;
      if ( Object.keys(sessionKeys[u]).length > 0 && sessionKeys[u][0] == key) {
        next();
      } else {
        res.send('NOT ALLOWED');
      }
    } else {
      res.send('NOT ALLOWED');
    }
  }

app.get("/add/user/:u/:p/:n", (req, res) => {
  User.find ({username: req.params.u}).exec(function(error, results) {
    if (results.length == 0) {
      var salt = crypto.randomBytes(64).toString("base64");
      crypto.pbkdf2(req.params.p, salt, iterations, 64, "sha512", (err, hash) => {
        if (err) throw err;
        let res = {salt: salt, hash: hash.toString("base64"), iterations: iterations };
        let hashStr = hash.toString("base64");
        console.log(res);
        var user = new User({
          "username" : req.params.u,
          "salt" : salt,
          "hash" : hashStr,
          "fullName" : req.params.n
        });
        user.save(function (err) {if (err) console.log("an error occured");});
      });
    } else {
      res.send("Username is already in use.")
    }
  });
});

app.get("/get/users/", (req, res) => {
    User.find({})
    .exec(function(error, results) {
      res.send(JSON.stringify(results, null, 2));
    });
  });

app.get("/login/:u/:p", (req, res) => {
  User.find({username: req.params.u}).exec(function(error, results) {
    if (results.length == 1) {
      var salt = results[0].salt;
      crypto.pbkdf2(req.params.p, salt, iterations, 64, "sha512", (err, hash) => {
        if (err) throw err;
        let hashStr = hash.toString("base64");
        if (results[0].hash == hashStr) {
          let sessionKey = Math.floor(Math.random() * 1000);
          sessionKeys[req.params.u] = [sessionKey, Date.now()];
          res.cookie("login", {username: req.params.u, key: sessionKey}, {maxAge: 60000});
          res.send("logged in");
        } else {
          res.send("Please Try Again");
        } 
      });
    } else {
      res.send("BAD");
    }
  });
});

app.post("/save/", (req, res) => {
  if (authentication != "NOT ALLOWED") {
    let bio = JSON.parse(req.body.bio);
    let img = JSON.parse(req.body.img);
    let fullName = JSON.parse(req.body.fullName);
    let age = JSON.parse(req.body.age);
    let loc = JSON.parse(req.body.loc);
    let newInterests = JSON.parse(req.body.interests);

    var ageObj = new Interests(age);
    var locObj = new Interests(loc);

    ageObj.save(function (err) { if (err) console.log('could not save age'); });
    locObj.save(function (err) { if (err) console.log('could not save location'); });

    User.find({username: req.cookies.login.username}).exec(function(error, results) {
      for(var i = 0; i < results.interests.length; i++) {
        if (results.interests[i].weight == 1) {
          results.interests.splice(i,1,locObj);
        } else if (results.interests[i].weight == 2) {
          results.interests.splice(i,1,ageObj);
        }
      }

      for(var i = 0; i < newInterests.length; i++) {
        let intObj = new Interests(newInterests[i]);
        intObj.save(function (err) { if (err) console.log('could not save intObj ' + i); });
        for(var j = 0; j < results.interests.length; j++) {
          if (results.interests[j].interest == intObj.interest) {
            continue;
          } else {
            results.interests.push(intObj);
          }
        }
      }

      bio == null ? results.bio = "" : results.bio = bio;
      img == null ? results.photo = "" : results.photo = img;
      fullName == null ? results.fullName = "" : results.fullName = fullName;
      age == null ? results.age = "" : results.age = ageObj.interest;
      loc == null ? results.location = "" : results.location = locObj.interest;
    });
    res.send("Changes Saved");
  }
  else {
    res.send("Changes Could Not Be Saved");
  }
});

app.get("/messages/", (req, res) => {
  if (authentication != "NOT ALLOWED") {
    let convoDict = new Set();
    let curUser = req.cookies.login.username;
    User.find({username: curUser})
    .populate("messages")
    .exec(function(error,results) {
      for (message_obj in results[0].messages) {
        User.find({username: message_obj.toID})
        .exec(function(error,results) {
          convoDict[results[0].username]=results[0].fullName;
        });
      }
      res.send(convoDict);
    });
  } else {
    res.send('NOT ALLOWED');
  }
});

app.get("/messages/:convo", (req, res) => {
  if (authentication != "NOT ALLOWED") {
    let messageList = [];
    let curUser = req.cookies.login.username;
    User.find({username: curUser})
    .populate("messages")
    .exec(function(error,results) {
      for (message_obj in results[0].messages) {
        if (message_obj.toID == req.params.convo) {
          let userMessage = 'to:' + message_obj.messages;
          messageList.push(userMessage);
        } else if (message_obj.fromID == req.params.convo) {
          let userMessage = 'fr:' + message_obj.messages;
          messageList.push(userMessage);
        }
      }
      res.send(messageList);
    });
  } else {
    res.send('NOT ALLOWED');
  }
});

app.post("/messages/:convo/send", (req, res) => {
  if (authentication != "NOT ALLOWED") {
    let curUser = req.cookies.login.username;
    
    let message = JSON.parse(req.body.message);

    var messageObj = new Messages(message);

    messageObj.fromID = curUser;

    messageObj.save(function (err) { if (err) console.log('could not save message'); });

    User.find({username: curUser})
    .exec(function(error,results) {
      try {
        let userMessages = results[0].messages;
        userMessages.push(message);
      } catch {
        res.send(error);
      }
    });

    User.find({username: req.params.convo})
    .exec(function(error,results) {
      try {
        let userMessages = results[0].messages;
        userMessages.push(message);
      } catch {
        res.send(error);
      }
      
    });
    res.send("Message Sent");
  } else {
    res.send('NOT ALLOWED');
  }
});

app.get("/profile", (req, res) => {
  if (authentication != "NOT ALLOWED") {
    let curUser = req.cookies.login.username;
    let toReturn = new Set();;

    User.find({username: curUser})
    .exec(function(error,results) {
      try {
        toReturn['fullName'] = results.fullName;
        toReturn['photo'] = results.photo;
        toReturn['age'] = results.age;
        toReturn['location'] = results.location;
        toReturn['bio'] = results.bio;

        let userInterests = '';
        for(var i = 0; i < results.interests.length; i++) {
          if (i == results.interests.length-1) {
            intList += results.interests[i].interest;
          } else {
            intList += results.interests[i].interest + ', ';
          }
        }
        toReturn['interests'] = userInterests;

        res.send(toReturn);
      } catch {
        res.send(error);
      }
    });
  }
});

app.listen(3000, () => {
    console.log('server has started');
});
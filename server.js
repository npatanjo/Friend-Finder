/*
    AUTHORS: Nate Patanjo, Nick Marquis
    FILE: server.js
    ASSIGNMENT: Final Project
    COURSE: CSc 337; Summer 2021
    PURPOSE: This is a website for finding your friends. You can
    make an account login and get matched with interesting people
*/

const express = require('express');
const mongoose = require('mongoose');
const parser = require('body-parser');
const cookieParser = require('cookie-parser');
const crypto = require ("crypto");
const multer = require('multer');


const upload = multer({dest: __dirname + '/uploads/images'});
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
    interests : [],
    messages : [],
    matches : [],
    skips : []
});

var MessagesSchema = new Schema ({
    toID : String,
    fromID : String,
    messages : String
});

var InterestsSchema = new Schema ({
    interest : String,
    weight: Number
});

var User = mongoose.model("User", UserSchema);
var Messages = mongoose.model("Messages", MessagesSchema);
var Interests = mongoose.model("Interests", InterestsSchema);
var sessionKeys = {};

app.use('/index.html', express.static('public_html/index'));
app.use('/user.html', authentication);
app.use("/", express.static('public_html'))

mongoose.connect(mongoDBURL , { useNewUrlParser: true });
db.on('error', console.error.bind(console, 'MongoDB connection error:'));

/*
session update
*/
function updateSessions() {
  console.log('session update function');
  let now = Date.now();
  for (e in sessionKeys) {
    if (sessionKeys[e][1] < (now - 120000)) {
      delete sessionKeys[e];
    }
  }
}

setInterval(updateSessions, 2000);

/*
for get user input
*/
app.get("/get/users", function (req, res) {
  User.find({}).exec(function(error, results) {
    res.send(JSON.stringify(results));
  });
});

/*
Authentication
*/
function authentication(req, res) {
  if (Object.keys(req.cookies).length > 0) {
    console.log(req.cookies.login.username);
    let u = req.cookies.login.username;
    let key = req.cookies.login.key;
    if (sessionKeys[u] == undefined) {
      console.log(sessionKeys);
      return('NOT ALLOWED');
    }
    if ( Object.keys(sessionKeys[u]).length > 0 && sessionKeys[u][0] == key) {
      return "OK";
    } else {
      return('NOT ALLOWED');
    }
  } else {
    return('NOT ALLOWED');
  }
}

/*
where users are added
*/
app.get("/add/user/:u/:p/:n", (req, res) => {
  User.find ({username: req.params.u}).exec(function(error, results) {
    if (results.length == 0) {
      var salt = crypto.randomBytes(64).toString("base64");
      crypto.pbkdf2(req.params.p, salt, iterations, 64, "sha512", (err, hash) => {
        if (err) throw err;
        let res = {salt: salt, hash: hash.toString("base64"), iterations: iterations };
        let hashStr = hash.toString("base64");
        var user = new User({
          "username" : req.params.u,
          "salt" : salt,
          "hash" : hashStr,
          "fullName" : req.params.n
        });
        user.save(function (err) {if (err) console.log("an error occured");});
      });
    } else {
      res.send("Username is already in use.");
    }
  });
});

/*
*/
function getUsers() {
  var intSet = new Set();
  User.find({})
  .exec(function(error, results) {
    for (userObj in results) {
      var intList = [];
      for (interestObj in results[userObj].interests) {
        console.log('intList');
        console.log(intList);
        intList.push(results[userObj].interests[interestObj].interest);
      }
      intSet[results[userObj].username] = intList;
      console.log('intSet');
      console.log(intSet);
    }
    console.log(intSet);
    return intSet;
  });  
}

/*
where users login
*/
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
          res.cookie("login", {username: req.params.u, key: sessionKey}, {maxAge: 120000});
          createMatches(req.params.u);
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

/*
where user info is saved 
*/
app.post("/save/", upload.single('photo'), (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    //let bio = JSON.parse(req.body.bio);
    let bio = req.body.bio;
    //let img = JSON.parse(req.body.img);
    let img = req.file.path;
    //let fullName = JSON.parse(req.body.fullName);
    let fullName = req.body.fullName;
    let age = JSON.parse(req.body.age);
    let loc = JSON.parse(req.body.loc);
    let newInterests = JSON.parse(req.body.interests);

    var ageObj = new Interests(age);
    var locObj = new Interests(loc);

    ageObj.save(function (err) { if (err) console.log('could not save age'); });
    locObj.save(function (err) { if (err) console.log('could not save location'); });

    User.find({username: req.cookies.login.username}).exec(function(error, results) {
      results[0].interests = [];
      results[0].interests.push(locObj);
      results[0].interests.push(ageObj);

      console.log(results[0].interests);

      for(var i = 0; i < newInterests.length; i++) {
        let parsedInterest = JSON.parse(newInterests[i]);
        let intObj = new Interests(parsedInterest);

        intObj.save(function (err) { if (err) console.log('could not save intObj ' + i); });
        results[0].interests.push(intObj);
      }

      console.log(results[0].interests);

      bio == null ? results[0].bio = "" : results[0].bio = bio;
      img == null ? results[0].photo = "" : results[0].photo = img;
      fullName == null ? results[0].fullName = "" : results[0].fullName = fullName;
      age == null ? results[0].age = "" : results[0].age = ageObj.interest;
      loc == null ? results[0].location = "" : results[0].location = locObj.interest;
      results[0].save(function (err) { if (err) console.log('could not save user - line 218'); });
      console.log(results[0]);
    });
    res.send("Changes Saved");
  }
  else {
    res.send("NOT ALLOWED");
  }
});

/*
*/
app.get("/get/username", (req, res) => {
  res.send(req.cookies.login.username);
});

/*
Where messages are sent
*/
app.get("/messages/", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    let convoDict = new Set();
    let curUser = req.cookies.login.username;
    User.find({username: curUser})
    .populate("messages")
    .exec(function(error,results) {
      for (message_obj in results[0].messages) {
        User.find({username: results[0].messages[message_obj].toID})
        .exec(function(error,result) {
          convoDict[results[0].username]=[result[0].fullName, result[0].photo];
        });
      }
      res.send(convoDict);
    });
  } else {
    res.send('NOT ALLOWED');
  }
});

/*
where the conversations are saved
*/
app.get("/messages/:convo", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    let messageList = [];
    let curUser = req.cookies.login.username;
    User.find({username: curUser})
    .populate("messages")
    .exec(function(error,results) {
      messageList.push(results[0].fullName);
      messageList.push(results[0].photo);

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

/*
where the current users id is linked to the 
user to message
*/
app.get("/messages/convo/send", (req, res) => {
  if (authentication(req, res) != "NOT ALLOWED") {
    let curUser = req.cookies.login.username;
    User.findOne({username: curUser}).exec(function(error,resultToMsg) {
      let userId = resultToMsg._id;
      let toId = resultToMsg.matches[0]._id;
      let toSend = {toid: toId, fromid: userId, message: "start of conversation"};
      var msgObj = new Messages(toSend);
      msgObj.save(function (err) { if (err) console.log('could not save message2 '+err); });
      console.log(resultToMsg.messages);
      resultToMsg.messages.push(msgObj);
      console.log(resultToMsg.messages);
      resultToMsg.save(function (err) {if (err) console.log("an error occured");});

      User.find({_id: toId})
      .exec(function(error,results) {
        console.log(results[0].messages);
        results[0].messages.push(msgObj);
        console.log(results[0].messages);
        results[0].save(function (err) {if (err) console.log("an error occured");});
      });
    });
    console.log("Message Sent");
  } else {
    res.send("NOT ALLOWED");
  }
});

/*

*/
app.post("/messages/:convo/send", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    let curUser = req.cookies.login.username;
    
    let message = JSON.parse(req.body.message);

    var messageObj = new Messages(message);
    messageObj.fromID = curUser;
    messageObj.save(function (err) { if (err) console.log('could not save message2 '+err); });


    User.find({username: curUser})
    .exec(function(error,results) {
      console.log(results[0].messages);
      results[0].messages.push(messageObj);
      console.log(results[0].messages);
      results[0].save(function (err) {if (err) console.log("an error occured");});
    });

    User.find({username: req.params.convo})
    .exec(function(error,results) {
      console.log(results[0].messages);
      results[0].messages.push(messageObj);
      console.log(results[0].messages);
      results[0].save(function (err) {if (err) console.log("an error occured");});
    });
    console.log("Message Sent");
  } else {
    res.send('NOT ALLOWED');
  }
});

/*
returns the current users profile
*/
app.get("/profile", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    let curUser = req.cookies.login.username;
    let toReturn = new Set();

    User.find({username: curUser})
    .exec(function(error,results) {
      try {
        toReturn['fullName'] = results[0].fullName;
        toReturn['photo'] = results[0].photo;
        toReturn['age'] = results[0].age;
        toReturn['location'] = results[0].location;
        toReturn['bio'] = results[0].bio;
        let userInterests = '';
        for(var i = 2; i < results[0].interests.length; i++) {
          if (i == results[0].interests.length-1) {
            userInterests += results[0].interests[i].interest;
          } else {
            userInterests += results[0].interests[i].interest + ', ';
          }
        }
        toReturn['interests'] = userInterests;

        res.send(toReturn);
      } catch {
        res.send(error);
      }
    });
  } else {
    res.send('NOT ALLOWED');
  }
});

/*
creates the matches and adds them as objects
into the User object
*/
function createMatches(username) {
  var matches = new Set();
  User.find({}).exec(function(error, resultsUsers) {
    User.findOne({username: username}).exec(function(error,resultsCurrent) {
      for (let i = 0; i < resultsCurrent.interests.length; i++) {
        for (let j = 0; j < resultsUsers.length; j++) {
          for (let k = 0; k < resultsUsers[j].interests.length; k++) {
            if (resultsUsers[j].interests[k].interest == resultsCurrent.interests[i].interest &&
              resultsUsers[j].username != resultsCurrent.username && 
              !(resultsCurrent.skips.includes(resultsUsers[j].username))) {
              matches.add(resultsUsers[j]);
            }
          }
        }
      }
      resultsCurrent.matches = Array.from(matches);
      resultsCurrent.save(function (err) {if (err) console.log("an error occured");});
    });
  });
}

/*
a getter method for the matches
*/
app.get("/get/matches", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {  
    let toReturn = new Set();
    User.find({username: req.cookies.login.username})
    .exec(function(error,results) {
      if (results[0].matches.length != 0) {
      User.find({username: results[0].matches[0].username})
      .exec(function(error,result) {
        try {
          console.log('result');
          console.log(result);
          toReturn['fullName'] = result[0].fullName;
          toReturn['photo'] = result[0].photo;
          toReturn['age'] = result[0].age;
          toReturn['location'] = result[0].location;
          toReturn['bio'] = result[0].bio;
          toReturn['username'] = result[0].username;
          res.send(toReturn);
        } catch {
          return (error);
        }
      });
      }
    });
  } else {
    res.send('NOT ALLOWED');
  }
});

/*
skips when skipped
*/
app.get("/skip/match", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    let curUser = req.cookies.login.username;
    User.findOne({username: curUser}).exec(function(error, results) {
      if (results.matches.length > 0) {
        results.matches.shift();
        results.save(function (err) {if (err) console.log("an error occured");});
        console.log("Brads Matches: " + results.matches);
      } else {
        res.send("No more matches");
      }
    });
  }
});

/*
filters the matches for the account
*/
function filterMatches(req) {
  console.log('filter');
  let curUser = req.cookies.login.username;
  
  User.find({username: curUser})
  .exec(function(error,results) {
     try {
      for (var i = 0; i < results[0].matches.length; i++) {
        for (var j = 0; j < results[0].skips.length; j++) {
          if (results[0].matches[i] == results[0].skips[j]) {
            results[0].matches.splice(i,1);
            i -= 1;
          }
        }
      }
      console.log('filter done');
      return (results[0].matches);
     } catch {
      return (error);
    }
  });
}

/*
gets your friends profile and returns to client
*/
app.get("/profile/:friend", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    let friend = req.params.friend;
    let toReturn = new Set();
    User.find({username: friend})
    .exec(function(error,results) {
      try {
        toReturn['fullName'] = results[0].fullName;
        toReturn['photo'] = results[0].photo;
        toReturn['age'] = results[0].age;
        toReturn['location'] = results[0].location;
        toReturn['bio'] = results[0].bio;
        toReturn['username'] = results[0].username;
      } catch {
        return (error);
      }
    });
  } else {
    res.send('NOT ALLOWED');
  }
});

/*
Deletes a friend
*/
app.get("/delete/:friend", (req, res) => {
  if (authentication(req, res)  != "NOT ALLOWED") {
    let curUser = req.cookies.login.username;
    let friend = req.params.friend;
    User.find({username: curUser})
    .populate("messages")
    .exec(function(error,results) {
      for (var i = 0; i< results[0].messages; i++) {
        if (results[0].messages[i].toID == friend) {
          results[0].messages.splice(i,1);
          i--;
        } else if (results[0].messages[i].fromID == friend) {
          results[0].messages.splice(i,1);
          i--;
        }
      }
      results[0].skips.push(friend);
    });
    res.send("Friend Deleted");
  } else {
    res.send('NOT ALLOWED');
  }
});

/*
Listen for server
*/
app.listen(3000, () => {
    console.log('server has started');
});

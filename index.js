const express = require('express');
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const nodemailer = require("nodemailer");
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const uri = process.env.MONGODB_URI || process.env.MONGO_DB_URI;

app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const { generateWorkoutPlan, generateNutritionPlan, generateMealPlan, generateCoachResponse, generateChatbotResponse } = require("./services/ai/ai.service");

app.get('/health', (req, res) => res.json({ success: true, service: "fitzone-server" }));

app.use(async (req, res, next) => {
  if (req.path === "/health" || req.path === "/health/db") {
    return next();
  }
  try {
    await connectDB();
    next();
  } catch (err) {
    console.error("[Global Middleware Error]:", err.message);
    res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
  }
});



const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),);
const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  // console.log("authHeader",authHeader)
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "unauthorized" });
  }
  const token = authHeader.split(" ")[1];
  //console.log(token);

  try {
    const { payload } = await jwtVerify(token, JWKS)
    req.user = payload

    next()
  } catch (error) {
    console.log(error)
    return res.status(401).json({ message: "token expired or invalid" });
  }
}

const optionalVerifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }
  const token = authHeader.split(" ")[1];
  try {
    const { payload } = await jwtVerify(token, JWKS);
    req.user = payload;
  } catch (error) {
    req.user = null;
  }
  next();
};

const trainerVerify = async (req, res, next) => {
  const user = req.user;
  if (user.role !== "trainer") {
    return res.status(403).json({ message: "Forbidden" });
  }
  next()
}

let client;
let database;
let classCollection;
let forumsCollection;
let forumCommentsCollection;
let newsletterCollection;
let paymentCollection;
let usersCollection;
let favoritesCollection;
let trainersCollection;
let aiPlansCollection;
let chatConversationsCollection;
let chatMessagesCollection;

let clientPromise = null;

const mongoOptions = {
  maxPoolSize: 10,
  minPoolSize: 0,
  maxIdleTimeMS: 30000,
  serverSelectionTimeoutMS: 10000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  retryWrites: true
};

async function connectDB() {
  if (!uri) {
    throw new Error("MongoDB connection string is missing. Please configure MONGODB_URI in .env.");
  }

  if (client) {
    try {
      await client.db("admin").command({ ping: 1 });
      return client;
    } catch (e) {
      client = null;
      database = null;
      clientPromise = null;
    }
  }

  if (clientPromise) return clientPromise;

  const newClient = new MongoClient(uri, mongoOptions);

  clientPromise = newClient.connect().then(async connectedClient => {
    try {
      await connectedClient.db("fitzone").command({ ping: 1 });
    } catch (pingError) {
      console.error("[MongoDB Connection Failed]\nName: " + pingError.name + "\nMessage: " + pingError.message);
      throw pingError;
    }

    client = connectedClient;
    database = client.db("fitzone");
    classCollection = database.collection("classes");
    forumsCollection = database.collection("forums");
    forumCommentsCollection = database.collection("forum_comments");
    newsletterCollection = database.collection("newsletter");
    paymentCollection = database.collection("payment");
    usersCollection = database.collection("user");
    favoritesCollection = database.collection("favorites");
    trainersCollection = database.collection("trainers");
    aiPlansCollection = database.collection("aiPlans");
    chatConversationsCollection = database.collection("chatConversations");
    chatMessagesCollection = database.collection("chatMessages");

    // Setup indexes for AI Plans
    aiPlansCollection.createIndex({ userEmail: 1, type: 1, status: 1 }).catch(console.error);
    aiPlansCollection.createIndex({ userEmail: 1, createdAt: -1 }).catch(console.error);

    return connectedClient;
  }).catch(err => {
    clientPromise = null;
    client = null;
    database = null;
    console.error("[MongoDB Connection Failed]\nName: " + err.name + "\nMessage: " + err.message + "\nCode: " + err.code + "\nCodeName: " + err.codeName);
    try {
      newClient.close();
    } catch (_) { }
    throw err;
  });

  return clientPromise;
}



// Premium Check Middleware
const premiumVerify = async (req, res, next) => {
  try {
    const user = req.user;
    const isPremium = await paymentCollection.findOne({ userEmail: user.email });
    if (!isPremium) {
      return res.status(403).json({ message: "Premium membership required" });
    }
    next();
  } catch (error) {
    return res.status(500).json({ message: "Failed to verify premium status" });
  }
};

// trainer application
// apply trainer

app.post("/trainer-applications", async (req, res) => {

  const applicationData = req.body;

  const { userId } = applicationData;

  // already applied check

  const alreadyApplied =
    await trainersCollection.findOne({ userId });

  if (alreadyApplied) {

    return res.send({
      success: false,
      message: "Already Applied",
    });

  }

  const result =
    await trainersCollection.insertOne({
      ...applicationData,
      status: "Pending",
    });

  res.send({
    success: true,
    result,
  });

});

app.get('/trainer-applications', async (req, res) => {
  const result = await trainersCollection.find().toArray();
  res.send(result);
});
app.patch("/trainer-applications/approve/:id", async (req, res) => {

  const { id } = req.params;

  // Find trainer application
  const application = await trainersCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!application) {
    return res.status(404).send({
      success: false,
      message: "Application not found",
    });
  }

  // Update application status
  await trainersCollection.updateOne(
    { _id: new ObjectId(id) },
    {
      $set: {
        status: "Approved",
      },
    }
  );

  // Update user role
  await usersCollection.updateOne(
    {
      _id: new ObjectId(application.userId),
    },
    {
      $set: {
        role: "trainer",
      },
    }
  );

  res.send({
    success: true,
    message: "Trainer approved successfully",
  });
});

// trainer rejected
app.patch("/trainer-applications/reject/:userId", async (req, res) => {
  const { userId } = req.params;

  const application = await trainersCollection.findOne({
    _id: new ObjectId(userId),
  });

  await trainersCollection.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { status: "Rejected" } }
  );

  res.send({
    success: true,
    message: "Rejected",
    application,
  });
});
//promote and demote trainer
app.patch("/users/:userId", async (req, res) => {

  const { userId } = req.params;
  const { role } = req.body;

  await usersCollection.updateOne(
    { _id: new ObjectId(userId) },
    { $set: { role } }
  );

  res.send({
    success: true,
    message: "User role updated successfully",
  });

});
//user blocked unblock
app.patch("/users/block/:userId", async (req, res) => {

  try {

    const { userId } = req.params;
    const { blocked } = req.body;

    await usersCollection.updateOne(
      { _id: new ObjectId(userId) },
      {
        $set: {
          blocked,
        },
      }
    );

    res.send({
      success: true,
      message: blocked
        ? "User blocked"
        : "User unblocked",
    });

  } catch (error) {

    res.status(500).send({
      success: false,
      message: error.message,
    });

  }
});


// Approve class
app.patch("/classes/approve/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await classCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Approved" } }
    );

    console.log("Approve result:", result);

    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Class not found" });
    }

    res.send({ success: true, message: "Class approved", result });
  } catch (error) {

    res.status(500).send({ success: false, message: error.message });
  }
});

// Reject class
app.patch("/classes/reject/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await classCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: { status: "Rejected" } }
    );



    if (result.matchedCount === 0) {
      return res.status(404).send({ success: false, message: "Class not found" });
    }

    res.send({ success: true, message: "Class rejected", result });
  } catch (error) {

    res.status(500).send({ success: false, message: error.message });
  }
});

// Delete class
app.delete("/classes/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await classCollection.deleteOne({ _id: new ObjectId(id) });



    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Class not found" });
    }

    res.send({ success: true, message: "Class deleted", result });
  } catch (error) {

    res.status(500).send({ success: false, message: error.message });
  }
});
//view forum by id
app.get("/forums/:id", async (req, res) => {

  const { id } = req.params;

  const result = await forumsCollection.findOne({
    _id: new ObjectId(id),
  });

  if (!result) {

    return res.status(404).send({
      success: false,
      message: "Forum not found",
    });

  }

  res.send({
    ...result,
    _id: result._id.toString(),
  });

});
//delete forum
app.delete("/forums/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const result = await forumsCollection.deleteOne({ _id: new ObjectId(id) });



    if (result.deletedCount === 0) {
      return res.status(404).send({ success: false, message: "Class not found" });
    }

    res.send({ success: true, message: "Class deleted", result });
  } catch (error) {

    res.status(500).send({ success: false, message: error.message });
  }
});
// favorites

app.post("/favorites", async (req, res) => {

  const { userId, classId } = req.body;

  // already favorite check

  const alreadyFavorite =
    await favoritesCollection.findOne({
      userId,
      classId,
    });

  // if already exists -> remove

  if (alreadyFavorite) {

    await favoritesCollection.deleteOne({
      _id: alreadyFavorite._id,
    });

    return res.send({
      favorite: false,
      message: "Removed from favorites",
    });

  }

  // add favorite

  const result =
    await favoritesCollection.insertOne({
      userId,
      classId,
    });

  res.send({
    favorite: true,
    message: "Added to favorites",
    result,
  });

});

app.get('/favorites/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await favoritesCollection.find({ userId }).toArray();
  res.send(result);
});

app.post("/subscription", async (req, res) => {
  const { sessionId, userId, productId, price, paymentDate, userEmail } = req.body;

  const isExist = await paymentCollection.findOne({ sessionId });
  if (isExist) {
    return res.json({ msg: "Already Exist" })
  }
  const result = await paymentCollection.insertOne({
    sessionId,
    userId,
    productId,
    price,
    paymentDate,
    userEmail
  })

  res.json({
    success: true,
    message: "payment successful",
    result,
  });
})

app.get('/classes', async (req, res) => {
  const result = await classCollection.find().toArray();
  res.send(result);
});
//pagination classes
app.get('/pagination/classes', async (req, res) => {
  const { search } = req.query;
  const { page = 1, limit = 8 } = req.query;
  const skip = (Number(page - 1)) * Number(limit);
  const result = await classCollection.find().skip(skip).limit(Number(limit)).toArray();
  const totalData = await classCollection.countDocuments();
  const totalPages = Math.ceil(totalData / Number(limit));
  res.send({ data: result, page: Number(page), totalPages });

});

// payment and booking class data
app.get('/subscription', async (req, res) => {
  const result = await paymentCollection.find().toArray();
  res.send(result);
});

app.get('/subscription/:userId', async (req, res) => {
  const { userId } = req.params;
  const result = await paymentCollection.find({ userId }).toArray();
  res.send(result);
});
// 
app.post('/classes', verifyToken, trainerVerify, async (req, res) => {
  const oneClass = req.body;
  const result = await classCollection.insertOne(oneClass);
  res.send(result);
});


app.get('/forums', async (req, res) => {
  const { page = 1, limit = 8 } = req.query;
  const skip = (Number(page - 1)) * Number(limit);
  const result = await forumsCollection.find().skip(skip).limit(Number(limit)).toArray();
  const totalData = await forumsCollection.countDocuments();
  const totalPages = Math.ceil(totalData / Number(limit));
  res.send({ data: result, page: Number(page), totalPages });

});

//forums manage
app.get('/manage/forums', async (req, res) => {
  const result = await forumsCollection.find().toArray();
  res.send(result);
});



// Forum interactions
app.patch('/forums/:id/like', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const forum = await forumsCollection.findOne({ _id: new ObjectId(id) });
  if (!forum) return res.status(404).json({ success: false, message: "Forum not found" });

  let likes = forum.likes || [];
  let dislikes = forum.dislikes || [];

  if (!likes.includes(userId)) likes.push(userId);
  dislikes = dislikes.filter(u => u !== userId);

  await forumsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { likes, dislikes } });
  res.json({ success: true, likes, dislikes });
});

app.patch('/forums/:id/dislike', async (req, res) => {
  const { id } = req.params;
  const { userId } = req.body;
  const forum = await forumsCollection.findOne({ _id: new ObjectId(id) });
  if (!forum) return res.status(404).json({ success: false, message: "Forum not found" });

  let likes = forum.likes || [];
  let dislikes = forum.dislikes || [];

  if (!dislikes.includes(userId)) dislikes.push(userId);
  likes = likes.filter(u => u !== userId);

  await forumsCollection.updateOne({ _id: new ObjectId(id) }, { $set: { likes, dislikes } });
  res.json({ success: true, likes, dislikes });
});

app.get('/forums/:id/comments', async (req, res) => {
  const { id } = req.params;
  const comments = await forumCommentsCollection.find({ forumId: id }).toArray();
  res.json(comments);
});

app.post('/forums/:id/comments', async (req, res) => {
  const { id } = req.params;
  const comment = { ...req.body, forumId: id, createdAt: req.body.createdAt || new Date().toISOString(), replies: req.body.replies || [] };
  const result = await forumCommentsCollection.insertOne(comment);
  res.json({ success: true, insertedId: result.insertedId });
});

app.patch('/forums/:id/comments/:commentId', async (req, res) => {
  const { commentId } = req.params;
  const { text } = req.body;
  await forumCommentsCollection.updateOne({ _id: new ObjectId(commentId) }, { $set: { text } });
  res.json({ success: true });
});

app.delete('/forums/:id/comments/:commentId', async (req, res) => {
  const { commentId } = req.params;
  await forumCommentsCollection.deleteOne({ _id: new ObjectId(commentId) });
  res.json({ success: true });
});

app.post('/forums/:id/comments/:commentId/reply', async (req, res) => {
  const { commentId } = req.params;
  const reply = { ...req.body, createdAt: req.body.createdAt || new Date().toISOString() };
  await forumCommentsCollection.updateOne({ _id: new ObjectId(commentId) }, { $push: { replies: reply } });
  res.json({ success: true });
});

app.post('/forums', async (req, res) => {
  const forum = req.body;
  const result = await forumsCollection.insertOne(forum);
  res.send(result);
});
app.get('/users', async (req, res) => {
  const result = await usersCollection.find().toArray();
  res.send(result);
});
//send email
app.post("/api/send-email", async (req, res) => {
  const { name, email } = req.query;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: email,
    subject: "FitZone",
    html: `
    <h1>Welcome to FitZone ${name}</h1>
    <p>Thank you for joining FitZone. We are excited to have you with us.</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "Email sent successfully" });
  } catch (error) {
    console.error("Email send error:", error);
    res.status(500).json({ success: false, message: "Failed to send email" });
  }
});

// AI Features Endpoints

const archiveActivePlan = async (userEmail, type, excludeId) => {
  await aiPlansCollection.updateMany(
    { userEmail, type, status: "active", _id: { $ne: excludeId } },
    { $set: { status: "archived", updatedAt: new Date() } }
  );
};

app.post('/ai/workout-plan', optionalVerifyToken, async (req, res) => {
  try {
    const { requirements } = req.body;
    const userEmail = req.user?.email;
    const userProfile = { email: userEmail, name: req.user?.name };

    const plan = await generateWorkoutPlan(userProfile, requirements);

    if (userEmail) {
      const newPlan = {
        userEmail,
        type: "workout",
        status: "active",
        source: "gemini",
        createdAt: new Date(),
        updatedAt: new Date(),
        preferences: requirements,
        planData: plan,
        title: `${requirements.goal || 'Fitness'} Workout Plan`
      };
      const insertResult = await aiPlansCollection.insertOne(newPlan);

      await archiveActivePlan(userEmail, "workout", insertResult.insertedId);

      return res.json({ success: true, plan: { ...newPlan, _id: insertResult.insertedId } });
    }

    return res.json({ success: true, plan: { planData: plan } });
  } catch (error) {
    if (error.code?.startsWith('AI_') || error.status === 429 || error.status === 503) {
      res.status(error.status || 500).json({ success: false, code: error.code, message: error.message });
    } else {
      if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
        res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
      } else {
        console.error("[AI Server Error]", error.message);
        res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
      }
    }
  }
});

app.post('/ai/nutrition-plan', optionalVerifyToken, async (req, res) => {
  try {
    const { requirements } = req.body;
    const userEmail = req.user?.email;
    const userProfile = { email: userEmail, name: req.user?.name };

    const plan = await generateNutritionPlan(userProfile, requirements);

    if (userEmail) {
      const newPlan = {
        userEmail,
        type: "nutrition",
        status: "active",
        source: "gemini",
        createdAt: new Date(),
        updatedAt: new Date(),
        preferences: requirements,
        planData: plan,
        title: `${requirements.goal || 'Daily'} Nutrition Plan`
      };
      const insertResult = await aiPlansCollection.insertOne(newPlan);

      await archiveActivePlan(userEmail, "nutrition", insertResult.insertedId);

      return res.json({ success: true, plan: { ...newPlan, _id: insertResult.insertedId } });
    }

    return res.json({ success: true, plan: { planData: plan } });
  } catch (error) {
    if (error.status === 429 || error.status === 503) {
      res.status(error.status).json({ success: false, code: error.code, message: error.message });
    } else {
      if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
        res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
      } else {
        console.error("[AI Server Error]", error.message);
        res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
      }
    }
  }
});

app.post('/ai/meal-plan', optionalVerifyToken, async (req, res) => {
  try {
    const { requirements } = req.body;
    const userEmail = req.user?.email;
    const userProfile = { email: userEmail, name: req.user?.name };

    const plan = await generateMealPlan(userProfile, requirements);

    if (userEmail) {
      const countryContext = requirements.country ? `${requirements.country} ` : "";

      const newPlan = {
        userEmail,
        type: "meal",
        status: "active",
        source: "gemini",
        createdAt: new Date(),
        updatedAt: new Date(),
        preferences: requirements,
        planData: plan,
        title: `${countryContext}${requirements.duration || '7'}-Day Meal Plan`
      };
      const insertResult = await aiPlansCollection.insertOne(newPlan);

      await archiveActivePlan(userEmail, "meal", insertResult.insertedId);

      return res.json({ success: true, plan: { ...newPlan, _id: insertResult.insertedId } });
    }

    return res.json({ success: true, plan: { planData: plan } });
  } catch (error) {
    if (error.status === 429 || error.status === 503) {
      res.status(error.status).json({ success: false, code: error.code, message: error.message });
    } else {
      if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
        res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
      } else {
        console.error("[AI Server Error]", error.message);
        res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
      }
    }
  }
});

app.get('/ai/dashboard-summary', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const activePlans = await aiPlansCollection.find({ userEmail, status: "active" }).toArray();

    const summary = {
      workout: { hasPlan: false },
      nutrition: { hasPlan: false },
      meal: { hasPlan: false },
      recommendation: { message: "Keep pushing forward! Stay consistent to see results." }
    };

    activePlans.forEach(plan => {
      if (plan.type === 'workout') {
        summary.workout = {
          hasPlan: true,
          planId: plan._id,
          title: plan.title,
          today: plan.planData?.weeklyPlan?.[0] || null
        };
      } else if (plan.type === 'nutrition') {
        summary.nutrition = {
          hasPlan: true,
          planId: plan._id,
          calories: plan.planData?.dailyTarget?.calories,
          macros: plan.planData?.dailyTarget
        };
      } else if (plan.type === 'meal') {
        summary.meal = {
          hasPlan: true,
          planId: plan._id,
          today: plan.planData?.days?.[0] || null
        };
      }
    });

    res.json({ success: true, summary });
  } catch (error) {
    if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
      res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
    } else {
      console.error("[AI Server Error]", error.message);
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
    }
  }
});

app.get('/ai/history', verifyToken, async (req, res) => {
  try {
    const { type, page = 1, limit = 10 } = req.query;
    const query = { userEmail: req.user.email };
    if (type && type !== 'all') query.type = type;

    const skip = (Number(page) - 1) * Number(limit);
    const plans = await aiPlansCollection.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit))
      .toArray();

    const total = await aiPlansCollection.countDocuments(query);

    res.json({
      success: true,
      data: plans,
      page: Number(page),
      totalPages: Math.ceil(total / Number(limit))
    });
  } catch (error) {
    if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
      res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
    } else {
      console.error("[AI Server Error]", error.message);
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
    }
  }
});

app.get('/ai/plans/:id', verifyToken, async (req, res) => {
  try {
    const plan = await aiPlansCollection.findOne({
      _id: new ObjectId(req.params.id),
      userEmail: req.user.email
    });

    if (!plan) return res.status(404).json({ success: false, message: "Plan not found or unauthorized" });

    res.json({ success: true, plan });
  } catch (error) {
    if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
      res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
    } else {
      console.error("[AI Server Error]", error.message);
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
    }
  }
});

app.patch('/ai/plans/:id/archive', verifyToken, async (req, res) => {
  try {
    const result = await aiPlansCollection.updateOne(
      { _id: new ObjectId(req.params.id), userEmail: req.user.email },
      { $set: { status: "archived", updatedAt: new Date() } }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: "Plan not found or unauthorized" });
    }

    res.json({ success: true, message: "Plan archived successfully" });
  } catch (error) {
    if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
      res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
    } else {
      console.error("[AI Server Error]", error.message);
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
    }
  }
});

app.post('/ai/coach', optionalVerifyToken, async (req, res) => {
  try {
    const { messages } = req.body;
    const userProfile = { email: req.user?.email, name: req.user?.name };

    const responseText = await generateCoachResponse(messages, userProfile);
    res.json({ success: true, response: responseText });
  } catch (error) {
    if (error.status === 429 || error.status === 503) {
      res.status(error.status).json({ success: false, code: error.code, message: error.message });
    } else {
      if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
        res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
      } else {
        console.error("[AI Server Error]", error.message);
        res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
      }
    }
  }
});

app.post('/ai/chat', optionalVerifyToken, async (req, res) => {
  try {
    const { message, conversationId } = req.body;
    const user = req.user;
    let aiContext = null;

    if (user) {
      const activePlans = await aiPlansCollection.find({ userEmail: user.email, status: "active" }).toArray();
      aiContext = {
        userProfile: { email: user.email, name: user.name },
        workout: activePlans.find(p => p.type === 'workout')?.planData || null,
        nutrition: activePlans.find(p => p.type === 'nutrition')?.planData || null,
        meal: activePlans.find(p => p.type === 'meal')?.planData || null
      };
    }

    let cid = conversationId;
    let history = [];

    if (user) {
      if (!cid) {
        const newConv = await chatConversationsCollection.insertOne({
          userEmail: user.email,
          title: "FitZone Chat",
          createdAt: new Date(),
          updatedAt: new Date()
        });
        cid = newConv.insertedId;
      } else {
        const msgs = await chatMessagesCollection.find({ conversationId: new ObjectId(cid), userEmail: user.email })
          .sort({ createdAt: 1 }).limit(20).toArray();
        history = msgs.map(m => ({ role: m.role, content: m.content }));
      }

      await chatMessagesCollection.insertOne({
        conversationId: new ObjectId(cid),
        userEmail: user.email,
        role: "user",
        content: message,
        createdAt: new Date()
      });
    } else {
      history = req.body.history || [];
    }

    const aiResponse = await generateChatbotResponse(message, history, aiContext);

    if (user) {
      await chatMessagesCollection.insertOne({
        conversationId: new ObjectId(cid),
        userEmail: user.email,
        role: "assistant",
        content: aiResponse,
        createdAt: new Date()
      });

      await chatConversationsCollection.updateOne(
        { _id: new ObjectId(cid) },
        { $set: { updatedAt: new Date() } }
      );
    }

    res.json({ success: true, response: aiResponse, conversationId: cid });
  } catch (error) {
    res.status(error.status || 500).json({ success: false, code: error.code, message: error.message });
  }
});

app.get('/ai/chat/history', verifyToken, async (req, res) => {
  try {
    const userEmail = req.user.email;
    const conversations = await chatConversationsCollection.find({ userEmail })
      .sort({ updatedAt: -1 }).limit(10).toArray();

    res.json({ success: true, conversations });
  } catch (error) {
    if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
      res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
    } else {
      console.error("[AI Server Error]", error.message);
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
    }
  }
});

app.get('/ai/chat/:id/messages', verifyToken, async (req, res) => {
  try {
    const messages = await chatMessagesCollection.find({
      conversationId: new ObjectId(req.params.id),
      userEmail: req.user.email
    }).sort({ createdAt: 1 }).toArray();

    res.json({ success: true, messages });
  } catch (error) {
    if (error.name === "MongoServerSelectionError" || error.name === "MongoTimeoutError") {
      res.status(503).json({ success: false, message: "Database service is temporarily unavailable." });
    } else {
      console.error("[AI Server Error]", error.message);
      res.status(500).json({ success: false, message: "An unexpected error occurred. Please try again later." });
    }
  }
});

// Send a ping to confirm a successful connection
console.log("Pinged your deployment. You successfully connected to MongoDB!");

app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.get('/health/db', async (req, res) => {
  try {
    const activeClient = await connectDB();
    res.json({ success: true, database: "connected" });
  } catch (err) {
    res.status(503).json({
      success: false,
      database: "unavailable",
      error: err.message,
      name: err.name,
      code: err.code,
      codeName: err.codeName
    });
  }
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "API route not found" });
});

if (require.main === module) {
  app.listen(port, () => {
    console.log(`FitZone server listening on port ${port}`);
  });
}

module.exports = app;
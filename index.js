const express = require('express');
const dotenv = require("dotenv");
dotenv.config();
const cors = require("cors");
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = process.env.MONGO_DB_URI


app.use(cors());
app.use(express.json());

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    //await client.connect();
    const database = client.db("fitzone");
    const classCollection = database.collection("classes");
    const forumsCollection = database.collection("forums");
    const paymentCollection = database.collection("payment");
    const usersCollection = database.collection("user");
    const favoritesCollection = database.collection("favorites");
    const trainersCollection = database.collection("trainers");

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
          { _id:new ObjectId(id) },
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
      const { page = 1, limit = 8 } = req.query;
      const skip = (Number(page - 1)) * Number(limit);
      const result = await classCollection.find().skip(skip).limit(Number(limit)).toArray();
      const totalData=await classCollection.countDocuments();
      const totalPages=Math.ceil(totalData/Number(limit));
      res.send({data:result,page :Number(page),totalPages});
   
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
    app.post('/classes', async (req, res) => {
      const oneClass = req.body;
      const result = await classCollection.insertOne(oneClass);
      res.send(result);
    });


    app.get('/forums', async (req, res) => {
      const { page = 1, limit = 8 } = req.query;
      const skip = (Number(page - 1)) * Number(limit);
      const result = await forumsCollection.find().skip(skip).limit(Number(limit)).toArray();
      const totalData=await forumsCollection.countDocuments();
      const totalPages=Math.ceil(totalData/Number(limit));
      res.send({data:result,page :Number(page),totalPages});
   
    });

    //forums manage
    app.get('/manage/forums/', async (req, res) => {
      const result = await forumsCollection.find().toArray();
      res.send(result);
    });


    app.post('/forums', async (req, res) => {
      const forum = req.body;
      const result = await forumsCollection.insertOne(forum);
      res.send(result);
    });
    // users data
    app.get('/users', async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });


    // Send a ping to confirm a successful connection
    //await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!');
});

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`);
});
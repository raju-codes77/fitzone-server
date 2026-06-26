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
      const { userId }= req.params;
      const result = await favoritesCollection.find({ userId }).toArray();
      res.send(result);
    });

    app.post("/subscription", async (req, res) => {
      const { sessionId, userId, productId } = req.body;

      const isExist = await paymentCollection.findOne({ sessionId });
      if (isExist) {
        return res.json({ msg: "Already Exist" })
      }
      const result = await paymentCollection.insertOne({
        sessionId,
        userId,
        productId,
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
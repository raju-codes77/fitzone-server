const express = require('express');
const dotenv=require("dotenv");
dotenv.config();
const cors=require("cors");
const app = express();
const port = process.env.PORT;
const { MongoClient, ServerApiVersion } = require('mongodb');
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
       const database=client.db("fitzone");
       const classCollection=database.collection("classes");
       const forumsCollection=database.collection("forums");

        app.get('/classes',async(req,res)=>{
             const result=await classCollection.find().toArray();
             res.send(result);
       });


       app.post('/classes',async(req,res)=>{
              const oneClass=req.body;
              const result=await classCollection.insertOne(oneClass);
              res.send(result);
       });

       
        app.get('/forums',async(req,res)=>{
             const result=await forumsCollection.find().toArray();
             res.send(result);
       });


       app.post('/forums',async(req,res)=>{
              const forum=req.body;
              const result=await forumsCollection.insertOne(forum);
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
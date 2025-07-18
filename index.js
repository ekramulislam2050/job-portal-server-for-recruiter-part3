const express = require('express');
const cors = require('cors');
const jwt = require("jsonwebtoken")
const cookieParser = require("cookie-parser")
const app = express();
require('dotenv').config()

const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.use(cors({
    origin: [
        'http://localhost:5173',
        'https://job-portal-client-7c64d.web.app',
        'https://job-portal-client-7c64d.firebaseapp.com'
    ],
    credentials: true
}));
app.use(express.json());
app.use(cookieParser())

const tokenVerify = (req, res, next) => {
    const token = req.cookies?.token
    console.log("token inside verification =", token)
    if (!token) {
        return res.status(401).send({ message: "unauthorize access" })
    }
    //   verify token----------
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
            return res.status(401).send({ message: 'unauthorize access' })
        }
        req.user = decoded
        next()
    })

}
// Programming hero mongo atlas uri-------------

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.swu9d.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Programming hero mongo atlas uri-------------

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hhpkb.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
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
        // await client.connect();
        // Send a ping to confirm a successful connection
        // await client.db("admin").command({ ping: 1 });
        // console.log("Pinged your deployment. You successfully connected to MongoDB!");

        // jobs related apis
        const db = client.db('job_portal_DB');
        const jobsCollection = db.collection('jobs');
        const jobApplicationCollection = db.collection('job_applications');

        // jwt apis------
        app.post("/jwt", (req, res) => {
            const user = req.body
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: "5h" })
            res.cookie("token", token, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"
            })
                .send({ success: true })
        })
        app.post("/logout", (req, res) => {
            res.clearCookie('token', {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: process.env.NODE_ENV === "production" ? "none" : "strict"
            })
                .send({ success: true })
        })


        // jobs related APIs
        app.get('/jobs', async (req, res) => {
            const sort = req.query?.sort
            const min =req.query?.min;
            const max = req.query?.max;
           
            let query={}
            const search=req.query?.search
                let sortQuery={}
            if(sort == "true"){
                sortQuery={"salaryRange.min":-1}
            }
            if(search){
                query={location:{$regex:search,$options:"i"}}
            }

            if(min && max){
                query={
                    ...query,
                    "salaryRange.min":{$gte:parseInt(min)},
                    "salaryRange.max":{$lte:parseInt(max)}
                }
            }
            const cursor = jobsCollection.find(query).sort(sortQuery);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get("/jobsGetByEmail", async (req, res) => {
            const email = req.query.email
            const query = { hr_email: email }
            const result = await jobsCollection.find(query).toArray()
            res.send(result)
        })

        app.get('/jobs/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await jobsCollection.findOne(query);
            res.send(result);
        });

        app.post('/jobs', async (req, res) => {
            const newJob = req.body;
            const result = await jobsCollection.insertOne(newJob);
            res.send(result);
        })


        // job application apis
        // get all data, get one data, get some data [o, 1, many]
        app.get('/job-application', tokenVerify, async (req, res) => {
            const email = req.query.email;
            const query = { applicant_email: email }
            if (req.user.email !== req.query.email) {
                return res.status(403).send({ message: "forbidden" })
            }

            const result = await jobApplicationCollection.find(query).toArray();

            // fokira way to aggregate data
            for (const application of result) {
                // console.log(application.job_id)
                const query1 = { _id: new ObjectId(application.job_id) }
                const job = await jobsCollection.findOne(query1);
                if (job) {
                    application.title = job.title;
                    application.location = job.location;
                    application.company = job.company;
                    application.company_logo = job.company_logo;
                }
            }

            res.send(result);
        })

        // app.get('/job-applications/:id') ==> get a specific job application by id

        app.get('/job-applications/jobs/:job_id', async (req, res) => {
            const jobId = req.params.job_id;
            console.log(jobId)
            const query = { job_id: jobId }
            const result = await jobApplicationCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/job-applications', async (req, res) => {
            const application = req.body;
            const result = await jobApplicationCollection.insertOne(application);

            // Not the best way (use aggregate) 
            // skip --> it
            const id = application.job_id;
            const query = { _id: new ObjectId(id) }
            const job = await jobsCollection.findOne(query);
            let newCount = 0;
            if (job.applicationCount) {
                newCount = job.applicationCount + 1;
            }
            else {
                newCount = 1;
            }

            // now update the job info
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    applicationCount: newCount
                }
            }

            const updateResult = await jobsCollection.updateOne(filter, updatedDoc);

            res.send(result);
        });


        app.patch('/job-applications/:id', async (req, res) => {
            const id = req.params.id;
            const data = req.body;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    status: data.status
                }
            }
            const result = await jobApplicationCollection.updateOne(filter, updatedDoc);
            res.send(result)
        })


    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Job is falling from the sky')
})

app.listen(port, () => {
    console.log(`Job is waiting at: ${port}`)
})
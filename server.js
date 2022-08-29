import bodyParser from 'body-parser';
import 'dotenv/config.js';
import express, { application } from 'express';
import fetch from 'node-fetch';
import { EC2Client, CreateTagsCommand, RunInstancesCommand } from '@aws-sdk/client-ec2';

const ec2App = express();
const KEY_PAIR_NAME = process.env.KEY_PAIR_NAME;

const ec2Client = new EC2Client ({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY,
        secretAccessKey: process.env.AWS_SECRET_KEY
    }
});

ec2App.use(bodyParser.json());

const SERVER_PORT = process.env.SERVER_PORT;
const EC2InstanceMetadataEndpoint = process.env.INSTANCE_METADATA_ENDPOINT;

ec2App.post('/createEC2Instance', async (req,res) =>{
    try{
        // included key pair as env var as it's
        // a user secret not a config setting
        const instanceSettings = {
            ImageId: req.body.amiID,
            InstanceType: req.body.instanceType,
            KeyName: KEY_PAIR_NAME,
            MinCount: req.body.minCount,
            MaxCount: req.body.maxCount,
        };

        const tagSetings = {
            Key: req.body.tagKey,
            Value: req.body.tagDescription
        };
        const resp = await createAWSInstance(instanceSettings, tagSetings);
        return res.status(200).send(resp);
    }
    catch (err) {
        console.log(err);
        return res.status(500).send({message: "An error has occured"});
    }
});

ec2App.get('/metadata', async (req,res)=>{
    try {
        const awsTokenResp = await fetch(`${EC2InstanceMetadataEndpoint}/latest/api/token`, {
            method: 'PUT',
            headers: {
                'X-aws-ec2-metadata-token-ttl-seconds': 21600
            }
        });

        const awsTokenText = await awsTokenResp.text();

        const metadata = await buildMetadataFromURL(`${EC2InstanceMetadataEndpoint}/latest/meta-data/`,awsTokenText);

        return res.status(200).send(metadata);
    }
    catch(err) {
        console.log(err);
        return res.status(500).send({message: "An error has occured"});
    }
});

ec2App.get('/metadata/:key', async (req,res) =>{
    const key = req.params.key;
    try {

        let URL = `${EC2InstanceMetadataEndpoint}/latest/meta-data/${key}/`;

        const awsTokenResp = await fetch(`${EC2InstanceMetadataEndpoint}/latest/api/token`, {
            method: 'PUT',
            headers: {
                'X-aws-ec2-metadata-token-ttl-seconds': 21600
            }
        });


        const awsTokenText = await awsTokenResp.text();

        const metadata = await buildMetadataFromURL(URL,awsTokenText);

        return res.status(200).send(metadata);
    }
    catch(err) {
        console.log(err);
        return res.status(500).send({message: "An error has occured"});
    }
});

const buildMetadataFromURL = async (url, awsToken) => {
    try{
        let metadataDict = {};

        const instanceCategories = await getURLAndReturnArray(url, awsToken);

        for(const instanceCategory of instanceCategories) {
            // metadata category depth > 1 i.e. network/mac
                let val= '';
                if (url.includes('public-keys/')) {
                    const pKey = instanceCategory.split('=')[0];
                    val = await getURLAndReturnArray(url + pKey + '/' + 'openssh-key', awsToken);
                    metadataDict[pKey] = val[0]
                }
                else if(instanceCategory.charAt(instanceCategory.length -1) == '/'){
                    const categoryWithoutForwardSlash = instanceCategory.slice(0,instanceCategory.length - 1);
                    val = await buildMetadataFromURL(url + instanceCategory, awsToken);
                    metadataDict[categoryWithoutForwardSlash] = val;
    
                }
                // metadata category depth of 1
                else{
                    val = await getURLAndReturnArray(url + instanceCategory, awsToken);
                    if(val[0] == '{'){
                        metadataDict[instanceCategory] = buildJsonStringFromArray(val);
                    }
                    else{
                        metadataDict[instanceCategory] = val[0];
                    }
                }
        };

        return metadataDict;
    }
    catch (err) {
        throw new Error(err.message);
    }
}

const getURLAndReturnArray = async (url, awsToken) =>{
    try {
        const instanceMetadata = await fetch(url, {
            method: 'GET',
            headers: {
                'X-aws-ec2-metadata-token': awsToken
            }
        });

        if(instanceMetadata.status == 404){
            throw new Error("Not found");
        }

        const instanceText = await instanceMetadata.text();

        const instanceMetaArray = instanceText.split('\n');

        return instanceMetaArray;
    }
    catch (err) {
        throw new Error(err.message);
    }
}

const buildJsonStringFromArray = (array)=>{
    let jsonString =array.join('');
    let finalCloseIndex = jsonString.lastIndexOf('}');
    return JSON.parse(jsonString.substring(0,finalCloseIndex+1));
}

const createAWSInstance = async (instanceSettings, partialTagSetings) =>{
    try{
        const resp = await ec2Client.send(new RunInstancesCommand(instanceSettings));
        const instID = resp.Instances[0].InstanceId;

        const completeTagSettings = {
            Resources: [instID],
            Tags: [
                {
                    Key: "Name",
                    Value: partialTagSetings['Key']
                },
                partialTagSetings
            ]
        }
        
        const tagResponse = await ec2Client.send(new CreateTagsCommand(completeTagSettings));

        return resp.$metadata;
    }
    catch (err) {
        throw new Error(err.message);
    }
};

ec2App.listen(SERVER_PORT, ()=>{
    console.log(`App listenting on PORT: ${SERVER_PORT}`);
});
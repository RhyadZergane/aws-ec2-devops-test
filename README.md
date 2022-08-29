# A DevOps tech test for software services CDL

### '/createEC2Instance' endpoint

Creates an AWS EC2 instance based on tag and confiugration settings from a JSON object. Also uses environment variable for the key file name as well as other AWS settings such as ACCESS KEY 

### '/metadata' endpoint

Retreives the metadata for all of the instance categories in for the AWS ec2 instance. Recursively traverses each directory to find key and appends to JSON object. If the value is already a JSON object, then it parses the string as JSON and appends to the larger JSON object. The final response is a JSON object with keys corresponding to the path and the values being the metadata at the lowest level of each category.

### '/metadata/:key' endpoint

Same logic as the metadata endpoint but for a specific category. I.e. for the monitoring/ ami info category.
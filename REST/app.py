#flask --app app run

from flask import Flask, jsonify, request, abort
import hashlib, json, uuid
from sample_data import sample_tvs, sample_clients


app = Flask(__name__)

# Resources
tokens_cache = set()
clients = sample_clients#{}#
orders = {}
tvs = sample_tvs#{}#


# Args
tv_args=["producer","model_name","price","size","stock"]
client_args=["name","address"]
order_args=["clientID","tvs"]#"status","total"]
order_required_edit_args=["clientID","tvs","status"]#"status"


def generate_etag(obj):
    obj_str = json.dumps(obj, sort_keys=True)
    return hashlib.sha1(obj_str.encode()).hexdigest()

def generate_uuid():
    return str(uuid.uuid4())

def get_token():
    token =  request.headers.get('token')
    if not token:
        return None
    return token

def paginate(data, page, size=2):
    start = (page - 1) * size
    end = start + size
    return data[start:end]

def check_required_arguments(args):

    data = request.json
    if(len(data)!=len(args)):
        return (False,args)
    for k in data.keys():
        if not k in args:
            return (False,args)    
    return (True,"")

def get_resource(resource_name,resource):

    etag = generate_etag(resource)
    if request.headers.get('If-Match') == etag:
        return '', 304

    resource_list = list(resource.values())

    page = request.args.get('page')
    if not page:
        return jsonify({resource_name: resource_list}),200,{'ETag': etag}
    else:    
        paginated_resource = paginate(resource_list,int(page))
        return jsonify({resource_name: paginated_resource}), 200, {'ETag': etag}

def get_object(objname,objID,resource):
    obj = resource.get(objID)
    
    if not obj:
        return jsonify({"error": objname+" not found"}), 404

    etag = generate_etag(obj)

    # Obsługa cache z ETag
    if request.headers.get('If-Match') == etag:
        return '', 304

    return jsonify(obj), 200, {'ETag': etag}

def create_object(name,args,resource):
    token = get_token()
    if not token:
        return (jsonify({"error": "Missing token"}), 400),""

    if token in tokens_cache:
        return (jsonify({"message": "Already processed"}), 200),""

    verify_args=check_required_arguments(args)
    if not verify_args[0]:
        return (jsonify({"message": "Not Allowed/Unknown/Missing arguments", "required/allowed arguments": verify_args[1]}), 400),""
    data = request.json

    object={"id": generate_uuid()}
    for arg in args:
        object[arg]=data[arg]

    resource[object['id']] = object
    

    return (jsonify({"message": name+"created successfully","id": object['id']}), 201,{'ETag': generate_etag(resource[object['id']])}),token

def replace_object(objname,objID,resource,args,replace=True):
    
    req_etag=request.headers.get('If-Match')

    if not req_etag:
        return jsonify({"error":'If-Match header is required for PUT requests'}), 400
    
    obj = resource.get(objID)
    
    if not obj:
        return jsonify({"error": objname+" "+objID+" not found"}), 404

    etag = generate_etag(obj)
    
    if req_etag != etag:
            return jsonify({"error":'ETag mismatch: The resource has been modified since retrieved'}),409
    
    verify_args=check_required_arguments(args)

    if not verify_args[0]:
        return jsonify({"message": "Unknown/Missing arguments", "required arguments": verify_args[1]}), 400
    
    if replace:
        data = request.json
        new_obj={"id": objID }
        for arg in args:
            new_obj[arg]=data[arg]

        resource[objID]=new_obj
        etag = generate_etag(new_obj)

    return objname+" updated", 200, {'ETag': etag}

def modify_object(objname,objID,resource,args,modify=True):
    req_etag=request.headers.get('If-Match')

    if not req_etag:
        return jsonify({"error":'If-Match header is required for PUT requests'}), 400
    
    obj = resource.get(objID)
    
    if not obj:
        return jsonify({"error": objname+" "+objID+" not found"}), 404

    etag = generate_etag(obj)
    
    if req_etag != etag:
            return jsonify({"error":'ETag mismatch: The resource has been modified since retrieved'}),409
    
    data = request.json
    
    if(len(data)>1):
        return jsonify({"error": "You can only edit one property by this endpoint"}), 400
    for arg in args:
        if arg in data:
            property=arg
            break
    else:
        return jsonify({"error": "Missing/Unknown "+objname+" property"}), 400

    if(modify):
        resource[objID][property]=data[property]
        etag = generate_etag(resource[objID])
        return objname+" updated", 200, {"ETag": etag}
    return property, 200
    
def delete_object(objname,objID,resource,delete=True):
    
    if objID not in resource:
        return jsonify({"error": objname+" "+objID+" not found"}), 404
    
    if delete:
        del resource[objID]
    return jsonify({"message": objname+" "+objID+" deleted"}), 200

def verify_if_order_data_exists(data):
    
    if "clientID" in data:
        client_id = data["clientID"]
        if client_id not in clients:
            return False, "Client: "+client_id+" does not exist"
    
    if "tvs" in data:
        if not (isinstance(data["tvs"], list) and len(data["tvs"]) > 0):
            return False, "TVS list must contain at least one element"

        for tv_id in data["tvs"]:
            if tv_id not in tvs:
                return False, f"TV with ID {tv_id} does not exist"
            if tvs[tv_id]["stock"] <= 0:
                return False, f"TV with ID {tv_id} is out of stock"
    if "status" in data:
        if data["status"] not in ["completed","pending"]:
            return False, "Uknown status, allowed status values: completed, pending"
    return True, "Data verification passed"

#update stock and calculate total
def handle_order(data):
    total = 0
    for tv_id in data["tvs"]:
        tv = tvs[tv_id]
        tv["stock"]=int(tv["stock"])-1
        price = float(tv["price"])
        total += price
    return str(total)




#----------------------------------
#Telewizory(TVs)

#----------------------------------
#GET: Lista telewizorów

@app.route('/tvs', methods=['GET'])
def get_tvs():
    return get_resource("tvs",tvs)
#----------------------------------
#POST: Dodanie nowego telewizora
@app.route('/tvs', methods=['POST'])
def create_tv():
    result=create_object("TV",tv_args,tvs)
    tokens_cache.add(result[1])
    return result[0]

#----------------------------------
#GET:Informacje o telewizorze
@app.route('/tvs/<string:tv_id>', methods=['GET'])
def get_tv(tv_id):
    return get_object("TV",tv_id,tvs)

#----------------------------------
#PUT: Całkowita aktualizacja telewizora
@app.route('/tvs/<string:tv_id>', methods=['PUT'])
def put_tv(tv_id):
    return replace_object("Tv",tv_id,tvs,tv_args)

#----------------------------------
#PATCH: Częściowa aktualizacja telewizora
@app.route('/tvs/<string:tv_id>', methods=['PATCH'])
def patch_tv(tv_id):
    return modify_object("Tv",tv_id,tvs,tv_args)

#----------------------------------
#DELETE Usunięcie telewizora
@app.route('/tvs/<string:tv_id>', methods=['DELETE'])
def delete_tv(tv_id):
    return delete_object("Tv",tv_id,tvs)



#----------------------------------
#Klienci(clients)

#----------------------------------
#GET: Lista klientów

@app.route('/clients', methods=['GET'])
def get_clients():
    return get_resource("client",clients)

#----------------------------------
#POST: Dodanie nowego klienta
@app.route('/clients', methods=['POST'])
def create_client():
    result=create_object("client",client_args,clients)
    tokens_cache.add(result[1])
    return result[0]

#----------------------------------
#GET:Informacje o kliencie
@app.route('/clients/<string:client_id>', methods=['GET'])
def get_client(client_id):
    return get_object("client",client_id,clients)

#----------------------------------
#PUT: Całkowita aktualizacja klienta
@app.route('/clients/<string:client_id>', methods=['PUT'])
def put_client(client_id):
    return replace_object("client",client_id,clients,client_args)

#----------------------------------
#PATCH: Częściowa aktualizacja klienta
@app.route('/clients/<string:client_id>', methods=['PATCH'])
def patch_client(client_id):
    return modify_object("client",client_id,clients,client_args)

#----------------------------------
#DELETE Usunięcie klienta
@app.route('/clients/<string:client_id>', methods=['DELETE'])
def delete_client(client_id):
    return delete_object("client",client_id,clients)


#----------------------------------
#Zamówienia (orders)

#----------------------------------
#GET: Lista Zamówień
@app.route('/orders', methods=['GET'])
def get_orders():
    return get_resource("orders",orders)

#----------------------------------
#POST: Dodanie nowego zamówienia
@app.route('/orders', methods=['POST'])
def create_order():
    result=create_object("order",order_args,orders)
    
    if result[0][1]!=201:
        return result[0]
    
    valid, message = verify_if_order_data_exists(request.json)
    if not valid:
        del  orders[objID]
        return jsonify({"error": message}), 400
    
    objID=result[0][0].get_json()["id"]
    orders[objID]['total'] = handle_order(request.json)
    orders[objID]['status'] = "pending"
    tokens_cache.add(result[1])
    result=(result[0][0],result[0][1],{'ETag': generate_etag(orders[objID])})
    
    return result
#----------------------------------
#GET:Informacje o zamówieniu
@app.route('/orders/<string:order_id>', methods=['GET'])
def get_order(order_id):
    return get_object("order",order_id,orders)

#----------------------------------
#PUT: Całkowita aktualizacja zamówienia
@app.route('/orders/<string:order_id>', methods=['PUT'])
def put_order(order_id):

    if order_id in orders:
        if(orders[order_id]["status"]=="completed"):
            return jsonify({"message": "Cannot modify completed orders"}),400
        
    result=replace_object("order",order_id,orders,order_required_edit_args,False)
    if result[1]!=200:
        return result

    valid, message = verify_if_order_data_exists(request.json)
    if not valid:
        return jsonify({"error": message}), 400
    
    data = request.json
    new_obj={"id": order_id }
    for arg in order_required_edit_args:
        new_obj[arg]=data[arg]

    orders[order_id]=new_obj
    orders[order_id]['total'] = handle_order(request.json)
    etag = generate_etag(new_obj)


    return result[0],result[1],{"ETag": etag}

#----------------------------------
#PATCH: Częściowa aktualizacja zamówienia
@app.route('/orders/<string:order_id>', methods=['PATCH'])
def patch_order(order_id):
    
    if order_id in orders:
        if(orders[order_id]["status"]=="completed"):
            return jsonify({"message": "Cannot modify completed orders"}),400
        
    result=modify_object("order",order_id,orders,order_required_edit_args,modify=False)
    
    if result[1]!=200:
        return result

    valid, message = verify_if_order_data_exists(request.json)
    if not valid:
        return jsonify({"error": message}), 400

    data = request.json
    orders[order_id][result[0]]=data[result[0]]

    if result[0]=="tvs":
        orders[order_id]['total'] = handle_order(request.json)
    etag = generate_etag(orders[order_id])

    return "order updated",200,{"ETag": etag}
    
    
#----------------------------------
#DELETE Usunięcie zamówienia 
@app.route('/orders/<string:order_id>', methods=['DELETE'])
def delete_order(order_id):
    if order_id in orders:
        if(orders[order_id]["status"]=="pending"):
            for tv in orders[order_id]["tvs"]:
                tvs[tv]["stock"]=int(tvs[tv]["stock"])+1
        

    return delete_object("order",order_id,orders)

if __name__=="__main__":
    app.run(debug=True)

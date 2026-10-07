import socket,socketserver,threading,subprocess,tempfile,pathlib,json,os,time,struct,uuid,sys
binary=sys.argv[1]
class TCP(socketserver.BaseRequestHandler):
 def handle(self):
  while b:=self.request.recv(65536):self.request.sendall(b)
class UDP(socketserver.BaseRequestHandler):
 def handle(self):self.request[1].sendto(self.request[0],self.client_address)
tcp=socketserver.ThreadingTCPServer(('127.0.0.1',0),TCP);udp=socketserver.ThreadingUDPServer(('127.0.0.1',0),UDP)
for s in [tcp,udp]:threading.Thread(target=s.serve_forever,daemon=True).start()
def readn(s,n):
 b=b''
 while len(b)<n:
  x=s.recv(n-len(b))
  if not x:raise RuntimeError('unexpected EOF')
  b+=x
 return b
def connect(port,cmd,host,dport):
 s=socket.create_connection(('127.0.0.1',port),timeout=10);s.sendall(b'\x05\x01\x00');assert readn(s,2)==b'\x05\x00'
 h=host.encode();s.sendall(b'\x05'+bytes([cmd])+b'\x00\x03'+bytes([len(h)])+h+struct.pack('!H',dport))
 r=readn(s,4);assert r[1]==0,r
 addr=socket.inet_ntop(socket.AF_INET if r[3]==1 else socket.AF_INET6,readn(s,4 if r[3]==1 else 16));p=struct.unpack('!H',readn(s,2))[0]
 return s,addr,p
def tx(port,host,n):
 s,_,_=connect(port,1,host,tcp.server_address[1]);data=b'x'*n
 threading.Thread(target=lambda:s.sendall(data),daemon=True).start();assert readn(s,n)==data;s.close()
with tempfile.TemporaryDirectory(prefix='usage-e2e-') as d:
 p=pathlib.Path(d);ledger=p/'usage.json';users=[str(uuid.uuid4()),str(uuid.uuid4())]
 server={'log':{'loglevel':'error'},'inbounds':[{'listen':'127.0.0.1','port':29880,'protocol':'vless','settings':{'decryption':'none','clients':[{'id':users[0],'email':'alice'},{'id':users[1],'email':'bob'}]}}],'dns':{'hosts':{'alpha.test':'127.0.0.1','beta.test':'127.0.0.1'},'servers':['localhost']},'outbounds':[{'protocol':'freedom','settings':{'targetStrategy':'UseIPv4','finalRules':[{'action':'allow'}]}}]}
 client={'log':{'loglevel':'error'},'inbounds':[],'outbounds':[],'routing':{'rules':[]}}
 for i,user in enumerate(users):
  tag=str(i);client['inbounds'].append({'tag':tag,'listen':'127.0.0.1','port':29881+i,'protocol':'socks','settings':{'auth':'noauth','udp':True,'ip':'127.0.0.1'}})
  client['outbounds'].append({'tag':tag,'protocol':'vless','settings':{'vnext':[{'address':'127.0.0.1','port':29880,'users':[{'id':user,'encryption':'none'}]}]}})
  client['routing']['rules'].append({'type':'field','inboundTag':[tag],'outboundTag':tag})
 (p/'server.json').write_text(json.dumps(server));(p/'client.json').write_text(json.dumps(client))
 env=dict(os.environ,BOAN_DESTINATION_USAGE_FILE=str(ledger));log=open(p/'log','w')
 def startserver():return subprocess.Popen([binary,'run','-c',str(p/'server.json')],env=env,stdout=log,stderr=log)
 srv=startserver();cli=subprocess.Popen([binary,'run','-c',str(p/'client.json')],stdout=log,stderr=log)
 try:
  time.sleep(1);tx(29881,'alpha.test',2*1024*1024);tx(29882,'beta.test',73)
  assoc,addr,port=connect(29881,3,'127.0.0.1',0)
  u=socket.socket(socket.AF_INET,socket.SOCK_DGRAM);u.settimeout(5)
  payload=b'd'*67;packet=b'\x00\x00\x00\x01'+socket.inet_aton('127.0.0.1')+struct.pack('!H',udp.server_address[1])+payload
  for i in range(3):u.sendto(packet,(addr,port));assert u.recv(4096).endswith(payload)
  u.close();assoc.close();time.sleep(6)
  state=json.loads(ledger.read_text());rows={(r['email'],r['host']):r for r in state['rows']}
  a=rows['alice','alpha.test'];b=rows['bob','beta.test'];v=rows['alice','127.0.0.1']
  assert (a['up'],a['down'])==(2*1024*1024,2*1024*1024),a
  assert (b['up'],b['down'])==(73,73),b
  assert (v['up'],v['down'])==(201,201),v
  srv.terminate();srv.wait(5);srv=startserver();time.sleep(1);tx(29881,'alpha.test',11);time.sleep(6)
  rows={(r['email'],r['host']):r for r in json.loads(ledger.read_text())['rows']}
  assert rows['alice','alpha.test']['up']==2*1024*1024+11
  assert rows['alice','alpha.test']['down']==2*1024*1024+11
  print('PASS: exact TCP 2 MiB, UDP 201 bytes, isolated users/domains, restart persistence',flush=True)
 except Exception:
  log.flush();print((p/'log').read_text()[-3000:]);raise
 finally:
  cli.terminate();srv.terminate();cli.wait(5);srv.wait(5);log.close();tcp.shutdown();udp.shutdown()

import pathlib,subprocess,sqlite3,json,os,shutil,time,gzip,socket
os.umask(0o077)
p=pathlib.Path('/root/destination-usage-deploy-'+time.strftime('%Y%m%d-%H%M%S'));p.mkdir()
panel=pathlib.Path('/usr/local/x-ui/x-ui');core=pathlib.Path('/usr/local/x-ui/bin/xray-linux-amd64')
env=pathlib.Path('/etc/systemd/system/x-ui.service.d/destination-usage.conf')
shutil.copy2(panel,p/'x-ui');shutil.copy2(core,p/'xray-linux-amd64')
oldenv=env.read_bytes() if env.exists() else None
if oldenv is not None:(p/'destination-usage.conf').write_bytes(oldenv)
usage=pathlib.Path('/var/lib/boan/destination-usage.json')
if usage.exists():shutil.copy2(usage,p/'destination-usage.json')
c=sqlite3.connect('/etc/x-ui/x-ui.db')
with sqlite3.connect(p/'before.db') as d:c.backup(d)
ports=[r[0] for r in c.execute('select port from inbounds where enable=1 and node_id is null')];c.close()
def listening(port):
 try:
  with socket.create_connection(('127.0.0.1',port),timeout=1):return True
 except OSError:return False
ports=[port for port in ports if listening(port)]
for src,dest in [('/var/tmp/boan-dest-x-ui.gz',panel),('/var/tmp/boan-usage-xray.gz',core)]:
 stage=dest.with_name(dest.name+'.dest-next')
 with gzip.open(src,'rb') as a,stage.open('wb') as b:shutil.copyfileobj(a,b)
 stage.chmod(0o755)
subprocess.run([str(core)+'.dest-next','run','-test','-c','/usr/local/x-ui/bin/config.json'],cwd='/usr/local/x-ui/bin',check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
subprocess.run(['systemctl','stop','x-ui'],check=True)
try:
 env.parent.mkdir(parents=True,exist_ok=True);env.write_text('[Service]\nEnvironment="BOAN_DESTINATION_USAGE_FILE=/var/lib/boan/destination-usage.json"\n')
 for dest in [panel,core]:os.replace(str(dest)+'.dest-next',dest)
 subprocess.run(['systemctl','daemon-reload'],check=True);started=int(time.time()*1000);subprocess.run(['systemctl','start','x-ui'],check=True)
 for i in range(30):
  time.sleep(1)
  try:
   data=json.loads(pathlib.Path('/var/lib/boan/destination-usage.json').read_text())
   assert data['updatedAt']>=started
   assert all(listening(port) for port in ports)
   subprocess.run(['systemctl','is-active','--quiet','x-ui'],check=True)
   break
  except Exception:
   if i==29:raise
 print(json.dumps({'backup':str(p),'ports':ports,'active':True,'usageReady':True,'rows':len(data['rows'])}))
except Exception:
 subprocess.run(['systemctl','stop','x-ui'])
 for dest,backup in [(panel,p/'x-ui'),(core,p/'xray-linux-amd64')]:
  stage=pathlib.Path(str(dest)+'.dest-next');shutil.copy2(backup,stage);os.replace(stage,dest)
 if oldenv is not None:env.write_bytes(oldenv)
 else:env.unlink(missing_ok=True)
 subprocess.run(['systemctl','daemon-reload'],check=True);subprocess.run(['systemctl','start','x-ui'],check=True)
 raise

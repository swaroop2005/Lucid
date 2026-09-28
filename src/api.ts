export async function api<T>(path:string,method='GET',body?:unknown,signal?:AbortSignal):Promise<T>{
 const response=await fetch(`/api${path}`,{method,signal,headers:{'Content-Type':'application/json','x-lucid-local':'1'},...(body===undefined?{}:{body:JSON.stringify(body)})});
 const result=await response.json();if(!response.ok)throw new Error(result.error||'The request could not be completed.');return result as T;
}

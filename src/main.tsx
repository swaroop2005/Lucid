import React from 'react';
import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import App from './App';
import './styles.css';
import './editorial.css';
import './console.css';
import './themes.css';
import './related-cases.css';
const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false}}});
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return {failed:true};}render(){return this.state.failed?<main className="fatal"><h1>Lucid could not display this view.</h1><p>Your saved records remain on this device.</p><button onClick={()=>location.reload()}>Reload workspace</button></main>:this.props.children;}}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><QueryClientProvider client={client}><App/></QueryClientProvider></Boundary></React.StrictMode>);

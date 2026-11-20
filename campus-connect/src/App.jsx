import { lazy, Suspense } from 'react';
import { Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home';
import ProtectedRoute from './components/ProtectedRoute';
import { useAuth } from './AuthContext';

// These pages are downloaded only when the user visits them
const EventDetails = lazy(() => import('./pages/EventDetails'));
const CreateEvent = lazy(() => import('./pages/CreateEvent'));
const Login = lazy(() => import('./pages/Login'));
const Register = lazy(() => import('./pages/Register'));

export default function App() {
  const { user, logout } = useAuth();

  return (
    <>
      <nav className='nav'>
        <Link to='/'>Home</Link>
        {user && user.role === 'admin' && <Link to='/create'>Create Event</Link>}
        <span className='spacer' />
        {user ? (
          <>
            <span>Hi, {user.name} ({user.role})</span>
            <button className='link-button' onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link to='/login'>Login</Link>
            <Link to='/register'>Register</Link>
          </>
        )}
      </nav>
      <Suspense fallback={<main className='container'><p>Loading page...</p></main>}>
        <Routes>
          <Route path='/' element={<Home />} />
          <Route path='/events/:id' element={<EventDetails />} />
          <Route
            path='/create'
            element={
              <ProtectedRoute role='admin'>
                <CreateEvent />
              </ProtectedRoute>
            }
          />
          <Route path='/login' element={<Login />} />
          <Route path='/register' element={<Register />} />
          <Route path='*' element={<main className='container'><p>Page not found</p></main>} />
        </Routes>
      </Suspense>
    </>
  );
}

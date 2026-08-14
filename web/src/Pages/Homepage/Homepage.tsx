import { useAuth } from "../../lib/AuthContext";

function Homepage() {
  const { user, loading, logout } = useAuth();

  if (loading) return <p>Loading...</p>;

  return (
    <div style={{ padding: 24 }}>
      {user ? (
        <>
          <p>Signed in as {user.firstName} {user.lastName}</p>
          <button onClick={logout}>Log out</button>
        </>
      ) : (
        <p>Not signed in</p>
      )}
    </div>
  );
}

export default Homepage;
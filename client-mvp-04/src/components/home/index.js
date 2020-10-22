import React from 'react';
import './index.scss';
import { Link } from 'react-router-dom';
import Button from '../../common/button';

const Home = () => {
  return (
    <section className="home-container">
      <h1 className="home-name">VRMS</h1>
      <h2 className="home-title">Volunteer Relationship Management System</h2>

      <Link to={'/page'} className="redirect-link">
        <Button content={`Sign in`} className={`home-button`} />
      </Link>

      <span className="home-text">or</span>

      <Link to="/page" className="home-link redirect-link">
        create account
      </Link>
    </section>
  );
};

export default Home;

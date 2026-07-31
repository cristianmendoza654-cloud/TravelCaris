import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('muestra el menú móvil principal', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('TravelCaris')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: /principal/i })).toBeInTheDocument();
    expect(screen.getAllByText('Inicio').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Itinerario').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Vuelos').length).toBeGreaterThan(0);
  });

  it('permite navegar a explorar', async () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );
    await userEvent.click(await screen.findByText('Más'));
    await userEvent.click(await screen.findByText('Explorar'));
    expect(await screen.findByText('Añadir desde enlace')).toBeInTheDocument();
  });

  it('muestra el último estado conocido cuando no hay conexión', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    render(
      <MemoryRouter initialEntries={['/vuelos']}>
        <App />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Sin conexión')).toBeInTheDocument();
    expect(screen.getByText(/último estado guardado/i)).toBeInTheDocument();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });
});

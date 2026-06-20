import { Component } from 'react'

// Перехватывает ошибки рендера, чтобы вместо белого экрана показать
// дружелюбное сообщение с кнопкой обновления.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Сбой интерфейса:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="state state--error">
          <p className="empty__title">Что-то пошло не так</p>
          <p className="empty__hint">
            Попробуйте обновить страницу. Если не помогло — зайдите чуть позже.
          </p>
          <button className="btn btn--primary" onClick={() => window.location.reload()}>
            Обновить
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

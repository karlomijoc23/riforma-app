const axiosMock = {
  interceptors: {
    request: { use: jest.fn() },
    response: { use: jest.fn() },
  },
  get: jest.fn(),
  post: jest.fn(),
  put: jest.fn(),
  delete: jest.fn(),
};

axiosMock.create = jest.fn(() => axiosMock);

export const resetAxiosMock = () => {
  axiosMock.get.mockReset();
  axiosMock.post.mockReset();
  axiosMock.put.mockReset();
  axiosMock.delete.mockReset();
  axiosMock.create.mockReset();
  axiosMock.interceptors.request.use.mockReset();
  axiosMock.interceptors.response.use.mockReset();
};

export default axiosMock;

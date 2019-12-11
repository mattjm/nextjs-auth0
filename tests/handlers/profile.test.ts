import { NextApiRequest, NextApiResponse } from 'next';
import { withoutApi } from './../helpers/default-settings';
import handlers from '../../src/handlers';
import { ISession } from '../../src/session/session';
import { ISessionStore } from '../../src/session/store';
import getRequestResponse from '../helpers/http';
import { userInfo } from '../helpers/oidc-nocks';

describe('profile handler', () => {
  const getStore = (session?: ISession, saveStore?: jest.Mock): ISessionStore => {
    const store: ISessionStore = {
      read(): Promise<ISession | null | undefined> {
        return Promise.resolve(session);
      },
      save(_req: NextApiRequest, _res: NextApiResponse, session: ISession): Promise<ISession> {
        return Promise.resolve(session);
      }
    };

    if (saveStore) {
      store.save = saveStore;
    }

    return store;
  };

  describe('when the call is invalid', () => {
    test('should throw an error if the request is null', async () => {
      const store = getStore();
      const profileHandler = handlers.ProfileHandler(withoutApi, store);

      const req: any = null;
      const { res } = getRequestResponse();

      return expect(profileHandler(req, res)).rejects.toEqual(
        new Error('Request is not available')
      );
    });

    test('should throw an error if the response is null', async () => {
      const store = getStore();
      const profileHandler = handlers.ProfileHandler(withoutApi, store);

      const { req } = getRequestResponse();
      const res: any = null;

      return expect(profileHandler(req, res)).rejects.toEqual(
        new Error('Response is not available')
      );
    });
  });

  describe('when signed in', () => {
    describe('when not asked to refetch', () => {
      const store = getStore({
        user: {
          sub: '123'
        },
        idToken: 'my-id-token',
        accessToken: 'my-access-token',
        refreshToken: 'my-refresh-token',
        createdAt: Date.now()
      });

      const { req, res, jsonFn } = getRequestResponse();

      test('should return the profile without any tokens', async () => {
        const profileHandler = handlers.ProfileHandler(withoutApi, store);
        await profileHandler(req, res);

        expect(jsonFn).toBeCalledWith({
          sub: '123'
        });
      });
    });

    describe('when asked to refetch', () => {
      test('should throw an error if the accessToken is missing', async () => {
        const store = getStore({
          user: {
            sub: '123'
          },
          createdAt: Date.now()
        });

        const profileHandler = handlers.ProfileHandler(withoutApi, store);

        const { req, res } = getRequestResponse();

        return expect(profileHandler(req, res, {refetch: true})).rejects.toEqual(
          new Error('The access token needs to be saved in the session for the user to be fetched')
        );
      });

      test('should refetch the user and update the session', async () => {
        const now = Date.now();
        const saveStore = jest.fn();
        const store = getStore({
          user: {
            sub: '123',
            email_verified: false
          },
          accessToken: 'my-access-token',
          createdAt: now
        }, saveStore);

        userInfo(withoutApi, 'my-access-token', {
          sub: '123',
          email_verified: true
        });

        const profileHandler = handlers.ProfileHandler(withoutApi, store);

        const { req, res, jsonFn } = getRequestResponse();
        await profileHandler(req, res, {refetch: true});

        // Saves the new user in the session
        expect(saveStore.mock.calls[0][2]).toEqual({
          user: {
            sub: '123',
            email_verified: true
          },
          accessToken: 'my-access-token',
          createdAt: now
        });

        // Returns the new user
        expect(jsonFn).toBeCalledWith({
          sub: '123',
          email_verified: true
        });
      });
    });
  });

  describe('when not signed in', () => {
    const store = getStore();
    const {
      req, res, jsonFn, statusFn
    } = getRequestResponse();

    test('should return not authenticated', async () => {
      const profileHandler = handlers.ProfileHandler(withoutApi, store);
      await profileHandler(req, res);

      expect(statusFn).toBeCalledWith(401);
      expect(jsonFn).toBeCalledWith({
        error: 'not_authenticated',
        description: 'The user does not have an active session or is not authenticated'
      });
    });
  });
});

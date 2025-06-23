import { create, StateCreator } from 'zustand';

type Friend = {
  id: string;
  name: string;
  avatar: string;
  selected: boolean;
};

type FriendsState = {
  friends: Friend[];
  toggleFriend: (id: string) => void;
  selectedCount: () => number;
};

const createStore: StateCreator<FriendsState> = (set, get) => ({
  friends: [
    { id: '1', name: 'Alice', avatar: 'https://i.pravatar.cc/150?u=alice', selected: false },
    { id: '2', name: 'Bob', avatar: 'https://i.pravatar.cc/150?u=bob', selected: false },
    { id: '3', name: 'Charlie', avatar: 'https://i.pravatar.cc/150?u=charlie', selected: false },
    { id: '4', name: 'David', avatar: 'https://i.pravatar.cc/150?u=david', selected: false },
    { id: '5', name: 'Eve', avatar: 'https://i.pravatar.cc/150?u=eve', selected: false },
  ],
  toggleFriend: (id: string) =>
    set((state) => ({
      friends: state.friends.map((friend) =>
        friend.id === id ? { ...friend, selected: !friend.selected } : friend
      ),
    })),
  selectedCount: () => {
    return get().friends.filter((f) => f.selected).length;
  },
});

const useFriendsStore = create<FriendsState>(createStore);

export default useFriendsStore; 
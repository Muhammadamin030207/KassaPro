from django.contrib.auth import get_user_model
from rest_framework import generics, status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from accounts.permissions import IsAdmin, IsOwner
from accounts.serializers import (
    OwnerRegisterSerializer,
    StaffCreateSerializer,
    UserSerializer,
    UserTokenObtainPairSerializer,
)

UserModel = get_user_model()


class LoginView(TokenObtainPairView):
    serializer_class = UserTokenObtainPairSerializer


class RefreshView(TokenRefreshView):
    pass


class RegisterOwnerView(APIView):
    """PUBLIC REGISTER BIRINCHI YOPILDI — faqat Super Admin ochadi.

    Eski open-register (har kim o'zi do'kon ochsin) butunlay yopildi.
    Yangi do'konlar faqat Super Admin paneli orqali yaratiladi.
    (Bot orqali arizalar → Admin tasdiqlaydi → kredensial avtomatik beriladi.)
    """

    permission_classes = [IsAdmin]

    def post(self, request):
        serializer = OwnerRegisterSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class MeView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class StaffListCreateView(generics.ListCreateAPIView):
    """Faqat owner: o'z do'konidagi kassirlar ro'yxati va yangi kassir qo'shish."""

    serializer_class = StaffCreateSerializer
    permission_classes = [IsOwner]

    def get_serializer_class(self):
        if self.request.method == "GET":
            return UserSerializer
        return StaffCreateSerializer

    def get_queryset(self):
        return (
            UserModel.objects.filter(shop=self.request.user.shop)
            .exclude(role=UserModel.Role.OWNER)
            .order_by("id")
        )


class StaffDeleteView(APIView):
    permission_classes = [IsOwner]

    def delete(self, request, pk):
        user = UserModel.objects.filter(
            pk=pk, shop=request.user.shop, role=UserModel.Role.CASHIER
        ).first()
        if not user:
            return Response(
                {"detail": "Kassir topilmadi."}, status=status.HTTP_404_NOT_FOUND
            )
        user.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
